import type { SignalTransportConfig } from "../../config.js";
import type { InboundMessage } from "../../core/types.js";
import type { GatewayTransport } from "../types.js";
import { SignalTransport as SignalHttp } from "./transport.js";

export class SignalTransport implements GatewayTransport {
  readonly name = "signal";
  private readonly http: SignalHttp;

  constructor(private readonly config: SignalTransportConfig) {
    this.http = new SignalHttp(config.httpUrl, config.account);
  }

  async healthCheck(): Promise<void> {
    await this.http.healthCheck();
  }

  async startReceiving(onMessage: (msg: InboundMessage) => Promise<void>): Promise<never> {
    return this.http.startReceiving((raw) =>
      onMessage({
        ...raw,
        access: {
          allowedSenderIds: this.config.allowedNumbers,
          adminSenderIds: this.config.adminNumbers,
          directMessagesOnly: this.config.directMessagesOnly,
          selfSenderIds: [this.config.account],
        },
      }),
    );
  }

  async sendText(message: InboundMessage, text: string): Promise<void> {
    await this.http.sendText(message.senderId, text);
  }

  async sendTextToRecipient(recipientId: string, text: string): Promise<void> {
    await this.http.sendText(recipientId, text);
  }
}
