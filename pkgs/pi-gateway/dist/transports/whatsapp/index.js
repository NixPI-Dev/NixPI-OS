import { WhatsAppBaileysTransport } from "./transport.js";
export class WhatsAppTransport {
    config;
    name = "whatsapp";
    transport;
    constructor(config) {
        this.config = config;
        this.transport = new WhatsAppBaileysTransport(config);
    }
    async healthCheck() {
        await this.transport.healthCheck();
    }
    async startReceiving(onMessage) {
        return this.transport.startReceiving((raw) => onMessage({
            ...raw,
            access: {
                allowedSenderIds: this.config.trustedNumbers.map((number) => `whatsapp:${number}`),
                adminSenderIds: this.config.adminNumbers.map((number) => `whatsapp:${number}`),
                directMessagesOnly: this.config.directMessagesOnly,
                selfSenderIds: [],
            },
        }));
    }
    async sendText(message, text) {
        await this.transport.sendText(message.senderId, text);
    }
    async sendTextToRecipient(recipientId, text) {
        await this.transport.sendText(recipientId, text);
    }
    async markSeen(message) {
        await this.transport.markSeen(message);
    }
    async startThinkingIndicator(message) {
        return this.transport.startThinkingIndicator(message);
    }
}
//# sourceMappingURL=index.js.map