import { createParser } from "eventsource-parser";
import { parseSignalNotification } from "./parser.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class SignalTransport {
    baseUrl;
    account;
    retryDelayMs = 3000;
    eventChain = Promise.resolve();
    constructor(baseUrl, account) {
        this.baseUrl = baseUrl;
        this.account = account;
    }
    async healthCheck() {
        const res = await fetch(`${this.baseUrl}/api/v1/check`);
        if (!res.ok)
            throw new Error(`signal-cli health check failed: ${res.status}`);
    }
    async sendText(recipient, text) {
        const body = JSON.stringify({
            jsonrpc: "2.0",
            method: "send",
            params: { account: this.account, recipient: [recipient], message: text },
            id: `send-${Date.now()}`,
        });
        const res = await fetch(`${this.baseUrl}/api/v1/rpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body,
        });
        if (!res.ok)
            throw new Error(`signal-cli send failed: ${res.status}`);
        const json = (await res.json());
        if (json.error)
            throw new Error(`signal-cli RPC error ${json.error.code}: ${json.error.message}`);
    }
    async startReceiving(onMessage) {
        for (;;) {
            try {
                await this.consumeEventStream(onMessage);
            }
            catch (err) {
                console.error("Signal SSE stream failed:", err);
            }
            await sleep(this.retryDelayMs);
        }
    }
    async consumeEventStream(onMessage) {
        const res = await fetch(`${this.baseUrl}/api/v1/events`, {
            headers: { Accept: "text/event-stream" },
        });
        if (!res.ok)
            throw new Error(`Signal events failed: ${res.status}`);
        if (!res.body)
            throw new Error("Signal events response had no body");
        const decoder = new TextDecoder();
        const parser = createParser({
            onEvent: (event) => {
                this.eventChain = this.eventChain
                    .catch(() => undefined)
                    .then(() => this.handleEvent(event, onMessage));
            },
            onRetry: (ms) => {
                if (Number.isFinite(ms) && ms > 0)
                    this.retryDelayMs = ms;
            },
        });
        const reader = res.body.getReader();
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                parser.feed(decoder.decode(value, { stream: true }));
            }
            parser.reset({ consume: true });
            await this.eventChain;
        }
        finally {
            reader.releaseLock();
        }
    }
    async handleEvent(event, onMessage) {
        if (!event.data)
            return;
        let parsed;
        try {
            parsed = JSON.parse(event.data);
        }
        catch {
            console.error("Failed to parse Signal SSE payload:", event.data);
            return;
        }
        const msg = parseSignalNotification(parsed);
        if (msg)
            await onMessage(msg);
    }
}
//# sourceMappingURL=transport.js.map