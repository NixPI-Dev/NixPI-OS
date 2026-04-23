import { createHash } from "node:crypto";
import { getContentType, isJidBroadcast, isJidGroup, isJidNewsletter, isJidStatusBroadcast, jidDecode, jidNormalizedUser, normalizeMessageContent, } from "@whiskeysockets/baileys";
function toIsoFromUnixSeconds(ts) {
    return new Date(ts * 1000).toISOString();
}
function hashMessage(parts) {
    return createHash("sha256").update(parts.join("|")).digest("hex");
}
function unixSeconds(value) {
    const raw = value == null ? Math.floor(Date.now() / 1000) : Number(value.toString());
    return Number.isFinite(raw) && raw > 0 ? raw : Math.floor(Date.now() / 1000);
}
function normalizePhoneLike(value) {
    const digits = value.replace(/\D/g, "");
    if (!digits)
        return value;
    return `+${digits}`;
}
function normalizeChatLike(prefix, jid) {
    const normalized = jidNormalizedUser(jid);
    const decoded = jidDecode(normalized);
    if (!decoded?.user)
        return `${prefix}:${normalized}`;
    if (decoded.server === "g.us")
        return `whatsapp-group:${decoded.user}`;
    if (decoded.server === "s.whatsapp.net" || decoded.server === "c.us") {
        return `whatsapp:${normalizePhoneLike(decoded.user)}`;
    }
    return `${prefix}:${decoded.user}`;
}
function normalizeSenderId(primaryJid, alternateJid, resolvePnForLid) {
    const mappedPn = resolvePnForLid?.(primaryJid);
    const candidate = (alternateJid && /^\d+@(?:s\.whatsapp\.net|c\.us)$/.test(alternateJid) ? alternateJid : undefined) ??
        mappedPn ??
        primaryJid;
    return normalizeChatLike("whatsapp", candidate);
}
function normalizeChatId(jid, resolvePnForLid) {
    const mappedPn = !isJidGroup(jid) ? resolvePnForLid?.(jid) : undefined;
    return normalizeChatLike(isJidGroup(jid) ? "whatsapp-group" : "whatsapp", mappedPn ?? jid);
}
function extractText(input) {
    const content = normalizeMessageContent(input.message);
    if (!content)
        return "";
    const type = getContentType(content);
    switch (type) {
        case "conversation":
            return content.conversation ?? "";
        case "extendedTextMessage":
            return content.extendedTextMessage?.text ?? "";
        case "imageMessage":
            return content.imageMessage?.caption ?? "";
        case "videoMessage":
            return content.videoMessage?.caption ?? "";
        case "documentMessage":
            return content.documentMessage?.caption ?? "";
        case "buttonsResponseMessage":
            return content.buttonsResponseMessage?.selectedDisplayText ?? "";
        case "listResponseMessage":
            return content.listResponseMessage?.title ?? "";
        case "templateButtonReplyMessage":
            return content.templateButtonReplyMessage?.selectedDisplayText ?? "";
        default:
            return "";
    }
}
export function parseWhatsAppMessage(input, resolvePnForLid) {
    const remoteJid = input.key.remoteJid;
    if (!remoteJid)
        return null;
    if (input.key.fromMe)
        return null;
    if (isJidStatusBroadcast(remoteJid))
        return null;
    if (isJidBroadcast(remoteJid))
        return null;
    if (isJidNewsletter(remoteJid))
        return null;
    const text = extractText(input).trim();
    if (!text)
        return null;
    const isGroup = Boolean(isJidGroup(remoteJid));
    const senderJid = isGroup ? input.key.participantAlt ?? input.key.participant : input.key.remoteJidAlt ?? remoteJid;
    if (!senderJid)
        return null;
    const chatId = normalizeChatId(remoteJid, resolvePnForLid);
    const senderId = normalizeSenderId(senderJid, isGroup ? input.key.participantAlt : input.key.remoteJidAlt, resolvePnForLid);
    const messageId = input.key.id?.trim()
        ? `whatsapp:${remoteJid}:${input.key.id.trim()}`
        : `whatsapp:${hashMessage([senderJid, remoteJid, String(unixSeconds(input.messageTimestamp)), text])}`;
    return {
        channel: "whatsapp",
        chatId,
        senderId,
        senderName: input.pushName?.trim() || undefined,
        messageId,
        timestamp: toIsoFromUnixSeconds(unixSeconds(input.messageTimestamp)),
        text,
        isGroup,
        transportRef: input.key.id
            ? {
                remoteJid,
                keyId: input.key.id,
                participant: input.key.participant ?? undefined,
            }
            : undefined,
    };
}
//# sourceMappingURL=parser.js.map