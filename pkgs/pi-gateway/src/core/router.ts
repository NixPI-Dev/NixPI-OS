import type { InboundMessage, RouterResult } from "./types.js";
import { Store } from "./store.js";
import { PiClient } from "./pi-client.js";
import { Policy } from "./policy.js";
import { PersonalRouter } from "./personal-router.js";
import { chunkText, normalizeReply } from "./formatter.js";
import { KeyedSerialQueue } from "./queue.js";

export class Router {
  private readonly queue = new KeyedSerialQueue();
  private readonly personalRouter = new PersonalRouter();

  constructor(
    private readonly store: Store,
    private readonly pi: PiClient,
    private readonly policy: Policy,
    private readonly maxReplyChars: number,
    private readonly maxReplyChunks: number,
    private readonly whatsappModelPolicy: { model?: string; allowedModels?: string[] } = {},
  ) {}

  handleMessage(msg: InboundMessage): Promise<RouterResult> {
    return this.queue.run(msg.chatId, () => this.handleMessageInner(msg));
  }

  private async handleMessageInner(msg: InboundMessage): Promise<RouterResult> {
    if (!this.policy.isAllowedSender(msg)) return { replies: [], markProcessed: false };
    if (!this.policy.isAllowedMessage(msg)) return { replies: [], markProcessed: false };
    if (this.store.hasProcessedMessage(msg.messageId)) return { replies: [], markProcessed: false };

    const text = msg.text.trim();
    if (!text) return { replies: [], markProcessed: true };

    const builtin = this.handleBuiltin(msg, text);
    if (builtin !== null) {
      return {
        replies: chunkText(normalizeReply(builtin), this.maxReplyChars, this.maxReplyChunks),
        markProcessed: true,
      };
    }

    try {
      const personalRoute = await this.personalRouter.route(msg, text);
      if (personalRoute.kind === "reply") {
        return {
          replies: chunkText(normalizeReply(personalRoute.text), this.maxReplyChars, this.maxReplyChunks),
          markProcessed: true,
        };
      }

      const existing = this.store.getChatSession(msg.chatId);
      const reply = await this.pi.prompt(personalRoute.message, existing?.sessionPath ?? null, {
        systemPromptAddendum: personalRoute.systemPromptAddendum,
        env: this.getPiEnvForMessage(msg),
        model: this.getPiModelForMessage(msg),
      });
      this.store.upsertChatSession(msg.chatId, msg.senderId, reply.sessionPath);

      return {
        replies: chunkText(normalizeReply(reply.text), this.maxReplyChars, this.maxReplyChunks),
        markProcessed: true,
      };
    } catch (err) {
      console.error("router.handleMessageInner failed:", err);
      return {
        replies: chunkText(
          "I hit an internal error. Please try again in a moment.",
          this.maxReplyChars,
          this.maxReplyChunks,
        ),
        markProcessed: true,
      };
    }
  }

  private handleBuiltin(msg: InboundMessage, text: string): string | null {
    const lowered = text.toLowerCase();
    const isAdmin = this.policy.isAdminSender(msg);

    if (lowered === "help") {
      const lines = [
        `You can chat with Pi here through ${msg.channel}.`,
        "",
        "Commands:",
        "  help   — show this message",
        "  reset  — start a fresh conversation",
      ];
      if (isAdmin) lines.push("  status — show session info (admin)");
      if (msg.channel === "whatsapp") {
        lines.push(
          "",
          "WhatsApp is personal mode: reminders, tasks, journaling, agenda, and life management.",
          "Use Pi Console/TUI for development, infrastructure, and technical operations.",
        );
      } else {
        lines.push("", "Everything else goes to Pi.");
      }
      return lines.join("\n");
    }

    if (lowered === "reset") {
      this.store.resetChatSession(msg.chatId);
      return `Started a fresh conversation for this ${msg.channel} chat.`;
    }

    if (lowered === "status") {
      if (!isAdmin) return "That command is admin-only.";
      const existing = this.store.getChatSession(msg.chatId);
      return [
        `channel: ${msg.channel}`,
        `sender:  ${msg.senderId}`,
        `admin:   yes`,
        `chat_id: ${msg.chatId}`,
        `session: ${existing?.sessionPath ?? "none"}`,
      ].join("\n");
    }

    return null;
  }

  private getPiEnvForMessage(msg: InboundMessage): NodeJS.ProcessEnv {
    if (msg.channel !== "whatsapp") return {};

    const personalRoot = process.env.PI_LLM_WIKI_DIR_PERSONAL;
    const allowedModels = this.normalizedAllowedSyntheticModelIds().join(",");
    return {
      PI_GATEWAY_PROFILE: "whatsapp-personal",
      PI_LLM_WIKI_ALLOWED_DOMAINS: "personal",
      PI_SYNTHETIC_ALLOWED_MODELS: allowedModels,
      ...(personalRoot ? { PI_LLM_WIKI_DIR: personalRoot } : {}),
    };
  }

  private getPiModelForMessage(msg: InboundMessage): string | undefined {
    if (msg.channel !== "whatsapp" || !this.whatsappModelPolicy.model) return undefined;
    return this.toSyntheticModelArg(this.whatsappModelPolicy.model);
  }

  private normalizedAllowedSyntheticModelIds(): string[] {
    const configured = this.whatsappModelPolicy.allowedModels ?? [];
    const candidates = configured.length > 0
      ? configured
      : this.whatsappModelPolicy.model
        ? [this.whatsappModelPolicy.model]
        : [];
    return [...new Set(candidates.map((model) => this.toSyntheticModelId(model)).filter(Boolean))];
  }

  private toSyntheticModelArg(model: string): string {
    const id = this.toSyntheticModelId(model);
    return `synthetic/${id}`;
  }

  private toSyntheticModelId(model: string): string {
    const trimmed = model.trim();
    return trimmed.startsWith("synthetic/") ? trimmed.slice("synthetic/".length) : trimmed;
  }
}
