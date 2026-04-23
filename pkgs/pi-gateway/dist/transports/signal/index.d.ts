import type { SignalTransportConfig } from "../../config.js";
import type { InboundMessage } from "../../core/types.js";
import type { GatewayTransport } from "../types.js";
export declare class SignalTransport implements GatewayTransport {
    private readonly config;
    readonly name = "signal";
    private readonly http;
    constructor(config: SignalTransportConfig);
    healthCheck(): Promise<void>;
    startReceiving(onMessage: (msg: InboundMessage) => Promise<void>): Promise<never>;
    sendText(message: InboundMessage, text: string): Promise<void>;
    sendTextToRecipient(recipientId: string, text: string): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map