import { SignalTransport as SignalHttp } from "./transport.js";
export class SignalTransport {
    config;
    name = "signal";
    http;
    constructor(config) {
        this.config = config;
        this.http = new SignalHttp(config.httpUrl, config.account);
    }
    async healthCheck() {
        await this.http.healthCheck();
    }
    async startReceiving(onMessage) {
        return this.http.startReceiving((raw) => onMessage({
            ...raw,
            access: {
                allowedSenderIds: this.config.allowedNumbers,
                adminSenderIds: this.config.adminNumbers,
                directMessagesOnly: this.config.directMessagesOnly,
                selfSenderIds: [this.config.account],
            },
        }));
    }
    async sendText(message, text) {
        await this.http.sendText(message.senderId, text);
    }
    async sendTextToRecipient(recipientId, text) {
        await this.http.sendText(recipientId, text);
    }
}
//# sourceMappingURL=index.js.map