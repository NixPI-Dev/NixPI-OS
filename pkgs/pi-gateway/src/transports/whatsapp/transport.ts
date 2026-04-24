import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type ConnectionState,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import pino from "pino";
import type { WhatsAppTransportConfig } from "../../config.js";
import type { InboundMessage } from "../../core/types.js";
import type { ThinkingIndicator } from "../types.js";
import { parseWhatsAppMessage } from "./parser.js";

type WhatsAppInbound = Omit<InboundMessage, "access">;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  settled: boolean;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const deferred: Deferred<T> = {
    promise: new Promise<T>((res, rej) => {
      resolve = (value) => {
        deferred.settled = true;
        res(value);
      };
      reject = (reason) => {
        deferred.settled = true;
        rej(reason);
      };
    }),
    resolve: (value) => resolve(value),
    reject: (reason) => reject(reason),
    settled: false,
  };
  return deferred;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WhatsAppBaileysTransport {
  private socket: WASocket | null = null;
  private messageChain: Promise<void> = Promise.resolve();
  private readonly logger = pino({ level: "silent" });
  private readonly lidToPn = new Map<string, string>();

  constructor(private readonly config: WhatsAppTransportConfig) {}

  async healthCheck(): Promise<void> {
    await mkdir(this.getAuthDir(), { recursive: true });
    await this.loadLidMappings();
  }

  async sendText(recipient: string, text: string): Promise<void> {
    const socket = this.requireSocket();
    const chatId = this.toChatJid(recipient);
    console.log(`whatsapp: sending message to ${recipient} (${chatId}) chars=${text.length}`);
    await socket.sendMessage(chatId, { text });
    console.log(`whatsapp: sent message to ${recipient}`);
  }

  async markSeen(message: InboundMessage): Promise<void> {
    if (message.channel !== "whatsapp" || !message.transportRef) return;

    const socket = this.requireSocket();
    await socket.readMessages([
      {
        remoteJid: message.transportRef.remoteJid,
        id: message.transportRef.keyId,
        participant: message.transportRef.participant,
        fromMe: false,
      },
    ]);
    console.log(`whatsapp: marked seen ${message.messageId}`);
  }

  async startThinkingIndicator(message: InboundMessage): Promise<ThinkingIndicator | null> {
    if (message.channel !== "whatsapp" || message.isGroup || !message.transportRef?.remoteJid) return null;

    const socket = this.requireSocket();
    const chatJid = message.transportRef.remoteJid;
    const intervalMs = 8_000;
    let stopped = false;

    const send = async (type: "composing" | "paused") => {
      await socket.presenceSubscribe(chatJid).catch(() => undefined);
      await socket.sendPresenceUpdate(type, chatJid);
      console.log(`whatsapp: presence ${type} -> ${chatJid}`);
    };

    await send("composing").catch((err) => {
      console.error(`whatsapp: failed to start thinking indicator for ${chatJid}:`, err);
    });

    const timer = setInterval(() => {
      if (stopped) return;
      void send("composing").catch((err) => {
        console.error(`whatsapp: failed to refresh thinking indicator for ${chatJid}:`, err);
      });
    }, intervalMs);

    return {
      stop: async () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        await send("paused").catch((err) => {
          console.error(`whatsapp: failed to stop thinking indicator for ${chatJid}:`, err);
        });
      },
    };
  }

  async startReceiving(onMessage: (msg: WhatsAppInbound) => Promise<void>): Promise<never> {
    for (;;) {
      try {
        await this.runSocket(onMessage);
      } catch (err) {
        console.error("WhatsApp Baileys transport failed:", err);
      } finally {
        this.socket = null;
      }

      await sleep(3_000);
    }
  }

  private async runSocket(onMessage: (msg: WhatsAppInbound) => Promise<void>): Promise<never> {
    const authDir = this.getAuthDir();
    await mkdir(authDir, { recursive: true });
    await this.loadLidMappings();

    const [{ state, saveCreds }, versionInfo] = await Promise.all([
      import("@whiskeysockets/baileys").then(({ useMultiFileAuthState }) => useMultiFileAuthState(authDir)),
      fetchLatestBaileysVersion().catch((err) => {
        console.warn("Failed to fetch latest Baileys WhatsApp version, using package defaults:", err);
        return null;
      }),
    ]);

    if (versionInfo) {
      console.log(`Using WhatsApp Web version ${versionInfo.version.join(".")}${versionInfo.isLatest ? "" : " (not latest)"}`);
    }

    const socket = makeWASocket({
      ...(versionInfo ? { version: versionInfo.version } : {}),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      logger: this.logger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      browser: ["NixPI", "Chrome", "1.0.0"],
    });
    this.socket = socket;

    const ready = createDeferred<void>();
    const closed = createDeferred<never>();

    const rejectLifecycle = (message: string, error?: unknown) => {
      const reason = error instanceof Error ? error : new Error(message);
      if (!ready.settled) ready.reject(reason);
      if (!closed.settled) closed.reject(reason);
    };

    socket.ev.on("creds.update", () => {
      void saveCreds().catch((err) => {
        console.error("Failed to persist Baileys credentials:", err);
      });
    });

    socket.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      void this.handleConnectionUpdate(update, ready, closed, rejectLifecycle);
    });

    socket.ev.on("lid-mapping.update", (update) => {
      this.rememberLidMapping(update.lid, update.pn);
    });

    socket.ev.on("messages.upsert", (upsert) => {
      if (upsert.type !== "notify") return;

      for (const message of upsert.messages) {
        this.learnMessageJidMappings(message);
        this.messageChain = this.messageChain
          .catch(() => undefined)
          .then(async () => {
            const parsed = parseWhatsAppMessage(message, (jid) => this.resolvePnForJid(jid));
            if (!parsed) return;
            console.log(`WhatsApp message received from ${parsed.senderId}`);
            await onMessage(parsed);
            console.log(`WhatsApp message handling completed for ${parsed.messageId}`);
          })
          .catch((err) => {
            console.error("Failed to handle WhatsApp message:", err);
          });
      }
    });

    await ready.promise;
    return closed.promise;
  }

  private async handleConnectionUpdate(
    update: Partial<ConnectionState>,
    ready: Deferred<void>,
    closed: Deferred<never>,
    rejectLifecycle: (message: string, error?: unknown) => void,
  ): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("WhatsApp QR received. Pair the dedicated Pi account to continue.");
      await Promise.all([this.saveQrImage(qr), this.saveQrPayload(qr)]);
    }

    if (connection === "open" && !ready.settled) {
      console.log("WhatsApp client ready — receiving messages.");
      await this.clearQrPayload();
      ready.resolve();
      return;
    }

    if (connection !== "close") return;

    const error = lastDisconnect?.error as Boom | Error | undefined;
    const statusCode = (error as Boom | undefined)?.output?.statusCode;
    const reason =
      statusCode === DisconnectReason.loggedOut
        ? "WhatsApp logged out — re-pair the Baileys session."
        : `WhatsApp disconnected${statusCode ? ` (code ${statusCode})` : ""}`;

    if (!ready.settled) {
      rejectLifecycle(`${reason} before ready.`, error ?? new Error(reason));
      return;
    }

    if (!closed.settled) {
      closed.reject(error ?? new Error(reason));
    }
  }

  private learnMessageJidMappings(message: { key: { remoteJid?: string | null; remoteJidAlt?: string | null; participant?: string | null; participantAlt?: string | null } }): void {
    this.rememberLidMapping(message.key.remoteJid, message.key.remoteJidAlt);
    this.rememberLidMapping(message.key.participant, message.key.participantAlt);
  }

  private rememberLidMapping(lidJid?: string | null, pnJid?: string | null): void {
    if (!lidJid || !pnJid || !lidJid.endsWith("@lid")) return;
    if (this.lidToPn.get(lidJid) === pnJid) return;
    this.lidToPn.set(lidJid, pnJid);
    void this.saveLidMappings().catch((err) => {
      console.error("Failed to persist WhatsApp LID mappings:", err);
    });
  }

  private resolvePnForJid(jid: string): string | undefined {
    return this.lidToPn.get(jid);
  }

  private async saveQrImage(qr: string): Promise<void> {
    try {
      const QRCode = (await import("qrcode")).default;
      const qrPath = this.getQrPath();
      await QRCode.toFile(qrPath, qr, { width: 512 });
      console.log(`WhatsApp QR saved as image: ${qrPath}`);
    } catch (err) {
      console.error("Failed to save QR image:", err);
    }
  }

  private async saveQrPayload(qr: string): Promise<void> {
    try {
      const qrTextPath = this.getQrTextPath();
      await writeFile(qrTextPath, `${qr.trim()}\n`, "utf-8");
      console.log(`WhatsApp QR payload saved as text: ${qrTextPath}`);
    } catch (err) {
      console.error("Failed to save QR payload:", err);
    }
  }

  private async clearQrPayload(): Promise<void> {
    try {
      await rm(this.getQrTextPath(), { force: true });
    } catch (err) {
      console.error("Failed to clear QR payload:", err);
    }
  }

  private async loadLidMappings(): Promise<void> {
    try {
      const raw = await readFile(this.getLidMapPath(), "utf-8");
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [lid, pn] of Object.entries(parsed)) {
        if (lid.endsWith("@lid") && pn) this.lidToPn.set(lid, pn);
      }
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        console.error("Failed to load WhatsApp LID mappings:", err);
      }
    }
  }

  private async saveLidMappings(): Promise<void> {
    await mkdir(this.config.sessionDataPath, { recursive: true });
    const data = Object.fromEntries([...this.lidToPn.entries()].sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(this.getLidMapPath(), JSON.stringify(data, null, 2), "utf-8");
  }

  private getAuthDir(): string {
    return path.join(this.config.sessionDataPath, "baileys");
  }

  private getLidMapPath(): string {
    return path.join(this.config.sessionDataPath, "lid-map.json");
  }

  private getQrPath(): string {
    return path.resolve(this.config.sessionDataPath, "..", "whatsapp-qr.png");
  }

  private getQrTextPath(): string {
    return path.resolve(this.config.sessionDataPath, "..", "whatsapp-qr.txt");
  }

  private requireSocket(): WASocket {
    if (!this.socket) throw new Error("WhatsApp socket is not initialized yet");
    return this.socket;
  }

  private toChatJid(recipient: string): string {
    if (recipient.startsWith("whatsapp-group:")) {
      return `${recipient.slice("whatsapp-group:".length)}@g.us`;
    }

    const raw = recipient.startsWith("whatsapp:") ? recipient.slice("whatsapp:".length) : recipient;
    if (raw.startsWith("+")) return `${raw.slice(1)}@s.whatsapp.net`;
    if (raw.includes("@")) return raw;
    if (/^\d+$/.test(raw)) return `${raw}@s.whatsapp.net`;
    throw new Error(`Unsupported WhatsApp recipient id: ${recipient}`);
  }
}
