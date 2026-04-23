export class Policy {
    isAllowedSender(msg) {
        if (msg.access.selfSenderIds.includes(msg.senderId))
            return false;
        return msg.access.allowedSenderIds.includes(msg.senderId);
    }
    isAdminSender(msg) {
        return msg.access.adminSenderIds.includes(msg.senderId);
    }
    isAllowedMessage(msg) {
        if (msg.access.directMessagesOnly && msg.isGroup)
            return false;
        return true;
    }
}
//# sourceMappingURL=policy.js.map