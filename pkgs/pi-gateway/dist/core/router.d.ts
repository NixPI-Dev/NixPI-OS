import type { InboundMessage, RouterResult } from "./types.js";
import { Store } from "./store.js";
import { PiClient } from "./pi-client.js";
import { Policy } from "./policy.js";
export declare class Router {
    private readonly store;
    private readonly pi;
    private readonly policy;
    private readonly maxReplyChars;
    private readonly maxReplyChunks;
    private readonly queue;
    private readonly personalRouter;
    constructor(store: Store, pi: PiClient, policy: Policy, maxReplyChars: number, maxReplyChunks: number);
    handleMessage(msg: InboundMessage): Promise<RouterResult>;
    private handleMessageInner;
    private handleBuiltin;
}
//# sourceMappingURL=router.d.ts.map