import type { WhatsAppTransportConfig } from "../../config.js";
import type { InboundMessage } from "../../core/types.js";
import type { GatewayTransport, ThinkingIndicator } from "../types.js";
import { WhatsAppBaileysTransport } from "./transport.js";

export class WhatsAppTransport implements GatewayTransport {
  readonly name = "whatsapp";
  private readonly transport: WhatsAppBaileysTransport;

  constructor(private readonly config: WhatsAppTransportConfig) {
    this.transport = new WhatsAppBaileysTransport(config);
  }

  async healthCheck(): Promise<void> {
    await this.transport.healthCheck();
  }

  async startReceiving(onMessage: (msg: InboundMessage) => Promise<void>): Promise<never> {
    return this.transport.startReceiving((raw) =>
      onMessage({
        ...raw,
        access: {
          allowedSenderIds: this.config.trustedNumbers.map((number) => `whatsapp:${number}`),
          adminSenderIds: this.config.adminNumbers.map((number) => `whatsapp:${number}`),
          directMessagesOnly: this.config.directMessagesOnly,
          selfSenderIds: [],
        },
      }),
    );
  }

  async sendText(message: InboundMessage, text: string): Promise<void> {
    await this.transport.sendText(message.isGroup ? message.chatId : message.senderId, text);
  }

  async sendTextToRecipient(recipientId: string, text: string): Promise<void> {
    await this.transport.sendText(recipientId, text);
  }

  async markSeen(message: InboundMessage): Promise<void> {
    await this.transport.markSeen(message);
  }

  async startThinkingIndicator(message: InboundMessage): Promise<ThinkingIndicator | null> {
    return this.transport.startThinkingIndicator(message);
  }
}
