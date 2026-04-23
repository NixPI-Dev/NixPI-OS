import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
function utcNow() {
    return new Date().toISOString();
}
export class Store {
    db;
    constructor(dbPath) {
        mkdirSync(dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.configure();
        this.init();
    }
    configure() {
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        this.db.pragma("busy_timeout = 5000");
        this.db.pragma("synchronous = NORMAL");
        this.db.pragma("temp_store = MEMORY");
    }
    init() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        chat_id    TEXT NOT NULL,
        sender_id  TEXT NOT NULL,
        received_at  TEXT NOT NULL,
        processed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pm_chat_id ON processed_messages(chat_id);

      CREATE TABLE IF NOT EXISTS chat_sessions (
        chat_id      TEXT PRIMARY KEY,
        sender_id    TEXT NOT NULL,
        session_path TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cs_sender ON chat_sessions(sender_id);

      CREATE TABLE IF NOT EXISTS sent_reminders (
        reminder_key TEXT NOT NULL,
        channel      TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        sent_at      TEXT NOT NULL,
        PRIMARY KEY (reminder_key, channel, recipient_id)
      );
    `);
    }
    hasProcessedMessage(messageId) {
        return !!this.db
            .prepare("SELECT 1 FROM processed_messages WHERE message_id = ?")
            .get(messageId);
    }
    markProcessed(messageId, chatId, senderId, receivedAt) {
        this.db
            .prepare(`INSERT OR IGNORE INTO processed_messages
           (message_id, chat_id, sender_id, received_at, processed_at)
         VALUES (?, ?, ?, ?, ?)`)
            .run(messageId, chatId, senderId, receivedAt, utcNow());
    }
    getChatSession(chatId) {
        const row = this.db
            .prepare("SELECT chat_id, sender_id, session_path, created_at, updated_at FROM chat_sessions WHERE chat_id = ?")
            .get(chatId);
        if (!row)
            return null;
        return {
            chatId: row.chat_id,
            senderId: row.sender_id,
            sessionPath: row.session_path,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    upsertChatSession(chatId, senderId, sessionPath) {
        const now = utcNow();
        this.db
            .prepare(`INSERT INTO chat_sessions (chat_id, sender_id, session_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
           sender_id    = excluded.sender_id,
           session_path = excluded.session_path,
           updated_at   = excluded.updated_at`)
            .run(chatId, senderId, sessionPath, now, now);
    }
    resetChatSession(chatId) {
        this.db.prepare("DELETE FROM chat_sessions WHERE chat_id = ?").run(chatId);
    }
    hasSentReminder(reminderKey, channel, recipientId) {
        return !!this.db
            .prepare("SELECT 1 FROM sent_reminders WHERE reminder_key = ? AND channel = ? AND recipient_id = ?")
            .get(reminderKey, channel, recipientId);
    }
    markReminderSent(reminderKey, channel, recipientId) {
        this.db
            .prepare(`INSERT OR IGNORE INTO sent_reminders
           (reminder_key, channel, recipient_id, sent_at)
         VALUES (?, ?, ?, ?)`)
            .run(reminderKey, channel, recipientId, utcNow());
    }
}
//# sourceMappingURL=store.js.map