import type { InboundMessage } from "../../core/types.js";
type SignalInbound = Omit<InboundMessage, "access">;
export declare class SignalTransport {
    private readonly baseUrl;
    private readonly account;
    private retryDelayMs;
    private eventChain;
    constructor(baseUrl: string, account: string);
    healthCheck(): Promise<void>;
    sendText(recipient: string, text: string): Promise<void>;
    startReceiving(onMessage: (msg: SignalInbound) => Promise<void>): Promise<never>;
    private consumeEventStream;
    private handleEvent;
}
export {};
//# sourceMappingURL=transport.d.ts.map