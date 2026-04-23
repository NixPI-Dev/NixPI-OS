/** Per-key serialised promise queue — keeps concurrent messages for one chat sequential. */
export declare class KeyedSerialQueue {
    private readonly chains;
    run<T>(key: string, task: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=queue.d.ts.map