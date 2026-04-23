import { createHash } from "node:crypto";
function extractEnvelope(msg) {
    return msg.envelope ?? msg.params?.envelope ?? msg.params?.result?.envelope ?? null;
}
function toIso(ts) {
    return new Date(ts).toISOString();
}
function hashMessage(parts) {
    return createHash("sha256").update(parts.join("|")).digest("hex");
}
export function parseSignalNotification(input) {
    if (!input || typeof input !== "object")
        return null;
    const msg = input;
    if (msg.method !== undefined && msg.method !== "receive")
        return null;
    const envelope = extractEnvelope(msg);
    if (!envelope)
        return null;
    if (envelope.syncMessage || envelope.receiptMessage || envelope.typingMessage)
        return null;
    const dataMessage = envelope.dataMessage;
    if (!dataMessage)
        return null;
    const text = dataMessage.message?.trim() ?? "";
    if (!text)
        return null;
    const senderId = envelope.sourceNumber ?? envelope.source ?? envelope.sourceUuid;
    if (!senderId)
        return null;
    const ts = dataMessage.timestamp ?? envelope.timestamp;
    if (!ts)
        return null;
    const isGroup = !!dataMessage.groupInfo;
    const groupId = dataMessage.groupInfo?.groupId;
    const chatId = isGroup ? `signal-group:${groupId ?? "unknown"}` : `signal:${senderId}`;
    const messageId = `signal:${hashMessage([
        senderId,
        String(ts),
        String(envelope.sourceDevice ?? ""),
        text,
        String(groupId ?? ""),
    ])}`;
    return {
        channel: "signal",
        chatId,
        senderId,
        senderName: envelope.sourceName ?? undefined,
        messageId,
        timestamp: toIso(ts),
        text,
        isGroup,
    };
}
//# sourceMappingURL=parser.js.map