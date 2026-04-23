import type { ChatSession } from "./types.js";
export declare class Store {
    private readonly db;
    constructor(dbPath: string);
    private configure;
    private init;
    hasProcessedMessage(messageId: string): boolean;
    markProcessed(messageId: string, chatId: string, senderId: string, receivedAt: string): void;
    getChatSession(chatId: string): ChatSession | null;
    upsertChatSession(chatId: string, senderId: string, sessionPath: string): void;
    resetChatSession(chatId: string): void;
    hasSentReminder(reminderKey: string, channel: string, recipientId: string): boolean;
    markReminderSent(reminderKey: string, channel: string, recipientId: string): void;
}
//# sourceMappingURL=store.d.ts.map