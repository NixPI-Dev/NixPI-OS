import type { WhatsAppTransportConfig } from "../../config.js";
import type { InboundMessage } from "../../core/types.js";
import type { ThinkingIndicator } from "../types.js";
type WhatsAppInbound = Omit<InboundMessage, "access">;
export declare class WhatsAppBaileysTransport {
    private readonly config;
    private socket;
    private messageChain;
    private readonly logger;
    private readonly lidToPn;
    constructor(config: WhatsAppTransportConfig);
    healthCheck(): Promise<void>;
    sendText(recipient: string, text: string): Promise<void>;
    markSeen(message: InboundMessage): Promise<void>;
    startThinkingIndicator(message: InboundMessage): Promise<ThinkingIndicator | null>;
    startReceiving(onMessage: (msg: WhatsAppInbound) => Promise<void>): Promise<never>;
    private runSocket;
    private handleConnectionUpdate;
    private learnMessageJidMappings;
    private rememberLidMapping;
    private resolvePnForJid;
    private saveQrImage;
    private getAuthDir;
    private getQrPath;
    private requireSocket;
    private toChatJid;
}
export {};
//# sourceMappingURL=transport.d.ts.map