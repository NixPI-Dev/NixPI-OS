import type { Store } from "../core/store.js";
import type { GatewayTransport } from "../transports/types.js";
export declare class ReminderDeliveryWorker {
    private readonly store;
    private readonly transport;
    private readonly recipientIds;
    private readonly pollIntervalMs;
    constructor(store: Store, transport: GatewayTransport, recipientIds: string[], pollIntervalMs?: number);
    start(): NodeJS.Timeout;
    tick(): Promise<void>;
}
//# sourceMappingURL=reminder-delivery.d.ts.map