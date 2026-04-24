export const EVOLUTION_AREAS = ["wiki", "persona", "extensions", "services", "system"] as const;
export const EVOLUTION_RISKS = ["low", "medium", "high"] as const;
export const EVOLUTION_STATUSES = ["proposed", "planning", "implementing", "validating", "reviewing", "applied", "rejected"] as const;
export const NIXOS_UPDATE_ACTIONS = ["status", "apply", "rollback"] as const;
export const SYSTEMD_ACTIONS = ["start", "stop", "restart", "status"] as const;
export const PROPOSAL_ACTIONS = ["status", "validate", "diff", "commit", "push", "apply"] as const;
export const ALLOWED_SYSTEMD_UNITS = new Set(["sshd", "syncthing", "reaction"]);
