/** Per-key serialised promise queue — keeps concurrent messages for one chat sequential. */
export class KeyedSerialQueue {
    chains = new Map();
    run(key, task) {
        const previous = this.chains.get(key) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(task);
        this.chains.set(key, next.finally(() => {
            if (this.chains.get(key) === next)
                this.chains.delete(key);
        }));
        return next;
    }
}
//# sourceMappingURL=queue.js.map