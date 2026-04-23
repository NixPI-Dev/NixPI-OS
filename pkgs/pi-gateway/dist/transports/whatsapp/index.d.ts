import type { WhatsAppTransportConfig } from "../../config.js";
import type { InboundMessage } from "../../core/types.js";
import type { GatewayTransport, ThinkingIndicator } from "../types.js";
export declare class WhatsAppTransport implements GatewayTransport {
    private readonly config;
    readonly name = "whatsapp";
    private readonly transport;
    constructor(config: WhatsAppTransportConfig);
    healthCheck(): Promise<void>;
    startReceiving(onMessage: (msg: InboundMessage) => Promise<void>): Promise<never>;
    sendText(message: InboundMessage, text: string): Promise<void>;
    sendTextToRecipient(recipientId: string, text: string): Promise<void>;
    markSeen(message: InboundMessage): Promise<void>;
    startThinkingIndicator(message: InboundMessage): Promise<ThinkingIndicator | null>;
}
//# sourceMappingURL=index.d.ts.map