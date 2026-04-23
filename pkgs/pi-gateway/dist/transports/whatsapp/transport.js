import { mkdir } from "node:fs/promises";
import path from "node:path";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, } from "@whiskeysockets/baileys";
import pino from "pino";
import { parseWhatsAppMessage } from "./parser.js";
function createDeferred() {
    let resolve;
    let reject;
    const deferred = {
        promise: new Promise((res, rej) => {
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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class WhatsAppBaileysTransport {
    config;
    socket = null;
    messageChain = Promise.resolve();
    logger = pino({ level: "silent" });
    lidToPn = new Map();
    constructor(config) {
        this.config = config;
    }
    async healthCheck() {
        await mkdir(this.getAuthDir(), { recursive: true });
    }
    async sendText(recipient, text) {
        const socket = this.requireSocket();
        const chatId = this.toChatJid(recipient);
        console.log(`whatsapp: sending message to ${recipient} (${chatId}) chars=${text.length}`);
        await socket.sendMessage(chatId, { text });
        console.log(`whatsapp: sent message to ${recipient}`);
    }
    async markSeen(message) {
        if (message.channel !== "whatsapp" || !message.transportRef)
            return;
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
    async startThinkingIndicator(message) {
        if (message.channel !== "whatsapp" || message.isGroup || !message.transportRef?.remoteJid)
            return null;
        const socket = this.requireSocket();
        const chatJid = message.transportRef.remoteJid;
        const intervalMs = 8_000;
        let stopped = false;
        const send = async (type) => {
            await socket.presenceSubscribe(chatJid).catch(() => undefined);
            await socket.sendPresenceUpdate(type, chatJid);
            console.log(`whatsapp: presence ${type} -> ${chatJid}`);
        };
        await send("composing").catch((err) => {
            console.error(`whatsapp: failed to start thinking indicator for ${chatJid}:`, err);
        });
        const timer = setInterval(() => {
            if (stopped)
                return;
            void send("composing").catch((err) => {
                console.error(`whatsapp: failed to refresh thinking indicator for ${chatJid}:`, err);
            });
        }, intervalMs);
        return {
            stop: async () => {
                if (stopped)
                    return;
                stopped = true;
                clearInterval(timer);
                await send("paused").catch((err) => {
                    console.error(`whatsapp: failed to stop thinking indicator for ${chatJid}:`, err);
                });
            },
        };
    }
    async startReceiving(onMessage) {
        for (;;) {
            try {
                await this.runSocket(onMessage);
            }
            catch (err) {
                console.error("WhatsApp Baileys transport failed:", err);
            }
            finally {
                this.socket = null;
            }
            await sleep(3_000);
        }
    }
    async runSocket(onMessage) {
        const authDir = this.getAuthDir();
        await mkdir(authDir, { recursive: true });
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
        const ready = createDeferred();
        const closed = createDeferred();
        const rejectLifecycle = (message, error) => {
            const reason = error instanceof Error ? error : new Error(message);
            if (!ready.settled)
                ready.reject(reason);
            if (!closed.settled)
                closed.reject(reason);
        };
        socket.ev.on("creds.update", () => {
            void saveCreds().catch((err) => {
                console.error("Failed to persist Baileys credentials:", err);
            });
        });
        socket.ev.on("connection.update", (update) => {
            void this.handleConnectionUpdate(update, ready, closed, rejectLifecycle);
        });
        socket.ev.on("lid-mapping.update", (update) => {
            this.rememberLidMapping(update.lid, update.pn);
        });
        socket.ev.on("messages.upsert", (upsert) => {
            if (upsert.type !== "notify")
                return;
            for (const message of upsert.messages) {
                this.learnMessageJidMappings(message);
                this.messageChain = this.messageChain
                    .catch(() => undefined)
                    .then(async () => {
                    const parsed = parseWhatsAppMessage(message, (jid) => this.resolvePnForJid(jid));
                    if (!parsed)
                        return;
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
    async handleConnectionUpdate(update, ready, closed, rejectLifecycle) {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("WhatsApp QR received. Pair the dedicated Pi account to continue.");
            await this.saveQrImage(qr);
        }
        if (connection === "open" && !ready.settled) {
            console.log("WhatsApp client ready — receiving messages.");
            ready.resolve();
            return;
        }
        if (connection !== "close")
            return;
        const error = lastDisconnect?.error;
        const statusCode = error?.output?.statusCode;
        const reason = statusCode === DisconnectReason.loggedOut
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
    learnMessageJidMappings(message) {
        this.rememberLidMapping(message.key.remoteJid, message.key.remoteJidAlt);
        this.rememberLidMapping(message.key.participant, message.key.participantAlt);
    }
    rememberLidMapping(lidJid, pnJid) {
        if (!lidJid || !pnJid || !lidJid.endsWith("@lid"))
            return;
        this.lidToPn.set(lidJid, pnJid);
    }
    resolvePnForJid(jid) {
        return this.lidToPn.get(jid);
    }
    async saveQrImage(qr) {
        try {
            const QRCode = (await import("qrcode")).default;
            const qrPath = this.getQrPath();
            await QRCode.toFile(qrPath, qr, { width: 512 });
            console.log(`WhatsApp QR saved as image: ${qrPath}`);
        }
        catch (err) {
            console.error("Failed to save QR image:", err);
        }
    }
    getAuthDir() {
        return path.join(this.config.sessionDataPath, "baileys");
    }
    getQrPath() {
        return path.resolve(this.config.sessionDataPath, "..", "whatsapp-qr.png");
    }
    requireSocket() {
        if (!this.socket)
            throw new Error("WhatsApp socket is not initialized yet");
        return this.socket;
    }
    toChatJid(recipient) {
        if (recipient.startsWith("whatsapp-group:")) {
            return `${recipient.slice("whatsapp-group:".length)}@g.us`;
        }
        const raw = recipient.startsWith("whatsapp:") ? recipient.slice("whatsapp:".length) : recipient;
        if (raw.startsWith("+"))
            return `${raw.slice(1)}@s.whatsapp.net`;
        if (raw.includes("@"))
            return raw;
        if (/^\d+$/.test(raw))
            return `${raw}@s.whatsapp.net`;
        throw new Error(`Unsupported WhatsApp recipient id: ${recipient}`);
    }
}
//# sourceMappingURL=transport.js.map