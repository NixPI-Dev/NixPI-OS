import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
function getWikiRoot() {
    if (process.env.PI_LLM_WIKI_DIR_PERSONAL)
        return process.env.PI_LLM_WIKI_DIR_PERSONAL;
    for (const entry of (process.env.PI_LLM_WIKI_ROOTS ?? "").split(",")) {
        const [name, ...rest] = entry.split(":");
        if (name?.trim().toLowerCase() === "personal") {
            const root = rest.join(":").trim();
            if (root)
                return root;
        }
    }
    return process.env.PI_LLM_WIKI_DIR ?? path.join(process.cwd(), "Knowledge");
}
function parseFrontmatter(raw) {
    if (!raw.startsWith("---\n"))
        return {};
    const end = raw.indexOf("\n---\n", 4);
    if (end === -1)
        return {};
    const lines = raw.slice(4, end).split("\n");
    const result = {};
    for (const line of lines) {
        const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
        if (!match)
            continue;
        result[match[1]] = match[2].trim();
    }
    return result;
}
function parseReminderDateTime(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
    const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
        ? `${normalized}:00`
        : normalized;
    const date = new Date(withSeconds);
    return Number.isNaN(date.getTime()) ? null : date;
}
function scanReminderFiles() {
    const remindersDir = path.join(getWikiRoot(), "pages", "planner", "reminders");
    if (!existsSync(remindersDir))
        return [];
    const files = readdirSync(remindersDir)
        .filter((entry) => entry.endsWith(".md"))
        .sort();
    const reminders = [];
    for (const file of files) {
        const fullPath = path.join(remindersDir, file);
        const raw = readFileSync(fullPath, "utf-8");
        const fm = parseFrontmatter(raw);
        if ((fm.type ?? "") !== "reminder")
            continue;
        if ((fm.domain ?? "") !== "personal")
            continue;
        if ((fm.status ?? "") !== "open")
            continue;
        if (!fm.remind_at)
            continue;
        const key = `${fullPath}:${fm.remind_at}`;
        reminders.push({
            key,
            path: fullPath,
            title: fm.title ?? path.basename(file, ".md"),
            remindAt: fm.remind_at,
            forText: fm.for,
            summary: fm.summary,
        });
    }
    return reminders;
}
function buildReminderText(reminder) {
    const what = reminder.forText || reminder.summary || reminder.title;
    return [
        `Reminder: ${reminder.title}`,
        `When: ${reminder.remindAt}`,
        what && what !== reminder.title ? `What: ${what}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
export class ReminderDeliveryWorker {
    store;
    transport;
    recipientIds;
    pollIntervalMs;
    constructor(store, transport, recipientIds, pollIntervalMs = 60_000) {
        this.store = store;
        this.transport = transport;
        this.recipientIds = recipientIds;
        this.pollIntervalMs = pollIntervalMs;
    }
    start() {
        return setInterval(() => {
            void this.tick().catch((err) => {
                console.error(`Reminder delivery tick failed for ${this.transport.name}:`, err);
            });
        }, this.pollIntervalMs);
    }
    async tick() {
        const now = new Date();
        const reminders = scanReminderFiles();
        for (const reminder of reminders) {
            const remindAt = parseReminderDateTime(reminder.remindAt);
            if (!remindAt || remindAt > now)
                continue;
            const text = buildReminderText(reminder);
            for (const recipientId of this.recipientIds) {
                if (this.store.hasSentReminder(reminder.key, this.transport.name, recipientId))
                    continue;
                await this.transport.sendTextToRecipient(recipientId, text);
                this.store.markReminderSent(reminder.key, this.transport.name, recipientId);
            }
        }
    }
}
//# sourceMappingURL=reminder-delivery.js.map