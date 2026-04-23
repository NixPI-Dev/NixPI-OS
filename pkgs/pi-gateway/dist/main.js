import { loadConfig } from "./config.js";
import { Store } from "./core/store.js";
import { PiClient } from "./core/pi-client.js";
import { Policy } from "./core/policy.js";
import { Router } from "./core/router.js";
import { ReminderDeliveryWorker } from "./personal/reminder-delivery.js";
import { SignalTransport } from "./transports/signal/index.js";
import { WhatsAppTransport } from "./transports/whatsapp/index.js";
async function main() {
    const configPath = process.argv[2] ?? "./pi-gateway.yml";
    const config = loadConfig(configPath);
    const store = new Store(config.gateway.dbPath);
    const transports = [];
    if (config.transports.signal?.enabled) {
        transports.push(new SignalTransport(config.transports.signal));
    }
    let reminderWorker = null;
    if (config.transports.whatsapp?.enabled) {
        const whatsappTransport = new WhatsAppTransport(config.transports.whatsapp);
        transports.push(whatsappTransport);
        reminderWorker = new ReminderDeliveryWorker(store, whatsappTransport, config.transports.whatsapp.trustedNumbers.map((number) => `whatsapp:${number}`));
    }
    if (transports.length === 0) {
        throw new Error("No transports enabled in pi-gateway config. Enable at least one under transports:");
    }
    const pi = new PiClient(config.pi.bin, config.gateway.sessionDir, config.pi.cwd, config.pi.timeoutMs);
    const policy = new Policy();
    const router = new Router(store, pi, policy, config.gateway.maxReplyChars, config.gateway.maxReplyChunks);
    await pi.healthCheck();
    console.log("pi health check OK");
    for (const transport of transports) {
        await transport.healthCheck();
        console.log(`${transport.name} transport health check OK`);
    }
    if (reminderWorker) {
        reminderWorker.start();
        console.log("WhatsApp reminder delivery worker started");
    }
    console.log(`Pi gateway started with transports: ${transports.map((t) => t.name).join(", ")}`);
    await Promise.all(transports.map((transport) => transport.startReceiving(async (msg) => {
        console.log(`router: handling ${msg.channel} message ${msg.messageId} from ${msg.senderId}`);
        await transport.markSeen?.(msg).catch((err) => {
            console.error(`transport: failed to mark seen for ${msg.messageId}:`, err);
        });
        const thinking = await transport.startThinkingIndicator?.(msg).catch((err) => {
            console.error(`transport: failed to start thinking indicator for ${msg.messageId}:`, err);
            return null;
        });
        try {
            const result = await router.handleMessage(msg);
            console.log(`router: result for ${msg.messageId} -> replies=${result.replies.length} markProcessed=${result.markProcessed}`);
            for (const [index, reply] of result.replies.entries()) {
                console.log(`router: sending reply ${index + 1}/${result.replies.length} for ${msg.messageId}`);
                await transport.sendText(msg, reply);
                console.log(`router: sent reply ${index + 1}/${result.replies.length} for ${msg.messageId}`);
            }
            if (result.markProcessed) {
                store.markProcessed(msg.messageId, msg.chatId, msg.senderId, msg.timestamp);
                console.log(`router: marked processed ${msg.messageId}`);
            }
        }
        finally {
            await thinking?.stop().catch((err) => {
                console.error(`transport: failed to stop thinking indicator for ${msg.messageId}:`, err);
            });
        }
    })));
}
main().catch((err) => {
    console.error("pi-gateway fatal:", err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map