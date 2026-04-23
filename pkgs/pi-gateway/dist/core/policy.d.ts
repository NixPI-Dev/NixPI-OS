import type { InboundMessage } from "./types.js";
export declare class Policy {
    isAllowedSender(msg: InboundMessage): boolean;
    isAdminSender(msg: InboundMessage): boolean;
    isAllowedMessage(msg: InboundMessage): boolean;
}
//# sourceMappingURL=policy.d.ts.map