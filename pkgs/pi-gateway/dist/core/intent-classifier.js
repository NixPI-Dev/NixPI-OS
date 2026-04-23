const technicalPatterns = [
    /\bnixos\b/i,
    /\bflake\b/i,
    /\brebuild\b/i,
    /\brollback\b/i,
    /\bdeploy\b/i,
    /\bapply\b/i,
    /\bservice\b/i,
    /\bsystemd\b/i,
    /\bjournalctl\b/i,
    /\blogs?\b/i,
    /\bssh\b/i,
    /\bwireguard\b/i,
    /\bwg\b/i,
    /\bgit\b/i,
    /\bcommit\b/i,
    /\bpush\b/i,
    /\bdiff\b/i,
    /\bcode\b/i,
    /\bconfig\b/i,
    /\brepo\b/i,
    /\bcontainer\b/i,
    /\bdocker\b/i,
    /\bkubernetes\b/i,
    /\bportainer\b/i,
    /\bserver\b/i,
    /\bhost\b/i,
    /\bfix\b.*\b(sync|service|ssh|server|config|nixos|repo)\b/i,
    /\brestart\b/i,
    /\breboot\b/i,
    /\bupdate the system\b/i,
    /\bedit\b.*\b(file|config|code)\b/i,
    /\bopen\b.*\b(file|repo|config)\b/i,
    /\bshow\b.*\bfile\b/i,
];
export function classifyIntent(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return "personal-safe";
    return technicalPatterns.some((pattern) => pattern.test(trimmed))
        ? "technical-operator"
        : "personal-safe";
}
//# sourceMappingURL=intent-classifier.js.map