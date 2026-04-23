import { createParser, type EventSourceMessage } from "eventsource-parser";
import { parseSignalNotification } from "./parser.js";
import type { InboundMessage } from "../../core/types.js";

type SignalInbound = Omit<InboundMessage, "access">;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class SignalTransport {
  private retryDelayMs = 3000;
  private eventChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly baseUrl: string,
    private readonly account: string,
  ) {}

  async healthCheck(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/check`);
    if (!res.ok) throw new Error(`signal-cli health check failed: ${res.status}`);
  }

  async sendText(recipient: string, text: string): Promise<void> {
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
    if (!res.ok) throw new Error(`signal-cli send failed: ${res.status}`);

    const json = (await res.json()) as { error?: { code?: number; message?: string } };
    if (json.error) throw new Error(`signal-cli RPC error ${json.error.code}: ${json.error.message}`);
  }

  async startReceiving(onMessage: (msg: SignalInbound) => Promise<void>): Promise<never> {
    for (;;) {
      try {
        await this.consumeEventStream(onMessage);
      } catch (err) {
        console.error("Signal SSE stream failed:", err);
      }
      await sleep(this.retryDelayMs);
    }
  }

  private async consumeEventStream(onMessage: (msg: SignalInbound) => Promise<void>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/events`, {
      headers: { Accept: "text/event-stream" },
    });

    if (!res.ok) throw new Error(`Signal events failed: ${res.status}`);
    if (!res.body) throw new Error("Signal events response had no body");

    const decoder = new TextDecoder();
    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        this.eventChain = this.eventChain
          .catch(() => undefined)
          .then(() => this.handleEvent(event, onMessage));
      },
      onRetry: (ms: number) => {
        if (Number.isFinite(ms) && ms > 0) this.retryDelayMs = ms;
      },
    });

    const reader = res.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      parser.reset({ consume: true });
      await this.eventChain;
    } finally {
      reader.releaseLock();
    }
  }

  private async handleEvent(
    event: EventSourceMessage,
    onMessage: (msg: SignalInbound) => Promise<void>,
  ): Promise<void> {
    if (!event.data) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      console.error("Failed to parse Signal SSE payload:", event.data);
      return;
    }
    const msg = parseSignalNotification(parsed);
    if (msg) await onMessage(msg);
  }
}
