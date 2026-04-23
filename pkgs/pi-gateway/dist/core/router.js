import { PersonalRouter } from "./personal-router.js";
import { chunkText, normalizeReply } from "./formatter.js";
import { KeyedSerialQueue } from "./queue.js";
export class Router {
    store;
    pi;
    policy;
    maxReplyChars;
    maxReplyChunks;
    queue = new KeyedSerialQueue();
    personalRouter = new PersonalRouter();
    constructor(store, pi, policy, maxReplyChars, maxReplyChunks) {
        this.store = store;
        this.pi = pi;
        this.policy = policy;
        this.maxReplyChars = maxReplyChars;
        this.maxReplyChunks = maxReplyChunks;
    }
    handleMessage(msg) {
        return this.queue.run(msg.chatId, () => this.handleMessageInner(msg));
    }
    async handleMessageInner(msg) {
        if (!this.policy.isAllowedSender(msg))
            return { replies: [], markProcessed: false };
        if (!this.policy.isAllowedMessage(msg))
            return { replies: [], markProcessed: false };
        if (this.store.hasProcessedMessage(msg.messageId))
            return { replies: [], markProcessed: false };
        const text = msg.text.trim();
        if (!text)
            return { replies: [], markProcessed: true };
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
            });
            this.store.upsertChatSession(msg.chatId, msg.senderId, reply.sessionPath);
            return {
                replies: chunkText(normalizeReply(reply.text), this.maxReplyChars, this.maxReplyChunks),
                markProcessed: true,
            };
        }
        catch (err) {
            console.error("router.handleMessageInner failed:", err);
            return {
                replies: chunkText("I hit an internal error. Please try again in a moment.", this.maxReplyChars, this.maxReplyChunks),
                markProcessed: true,
            };
        }
    }
    handleBuiltin(msg, text) {
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
            if (isAdmin)
                lines.push("  status — show session info (admin)");
            if (msg.channel === "whatsapp") {
                lines.push("", "WhatsApp is personal mode: reminders, tasks, journaling, agenda, and life management.", "Use Pi Console/TUI for development, infrastructure, and technical operations.");
            }
            else {
                lines.push("", "Everything else goes to Pi.");
            }
            return lines.join("\n");
        }
        if (lowered === "reset") {
            this.store.resetChatSession(msg.chatId);
            return `Started a fresh conversation for this ${msg.channel} chat.`;
        }
        if (lowered === "status") {
            if (!isAdmin)
                return "That command is admin-only.";
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
}
//# sourceMappingURL=router.js.map