import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface PermissionConfig {
  deny?: string[];
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesGlob(subject: string, pattern: string): boolean {
  return globToRegex(pattern).test(subject);
}

function matchesRule(tool: string, command: string, rule: unknown): boolean {
  if (typeof tool !== "string" || typeof command !== "string" || typeof rule !== "string") {
    return false;
  }

  const match = rule.match(/^(\w+)\((.+)\)$/);
  if (!match) return false;
  if (match[1].toLowerCase() !== tool.toLowerCase()) return false;
  return matchesGlob(command, match[2]);
}

function loadConfig(cwd: string): PermissionConfig {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");

  const candidates = [
    path.join(cwd, ".pi", "permissions.json"),
    path.join(process.env.HOME || "/root", ".pi", "agent", "permissions.json"),
  ];

  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as PermissionConfig;
    } catch {
      // Missing or invalid permission config means built-in deny rules only.
    }
  }

  return {};
}

const NIXPI_DENY: Array<{ pattern: string; description?: string }> = [
  { pattern: "Bash(rm -rf *)", description: "recursive force delete" },
  { pattern: "Bash(sudo rm -rf *)", description: "sudo recursive delete" },
  { pattern: "Bash(mkfs.*)", description: "format filesystem" },
  { pattern: "Bash(dd if=*)", description: "raw disk write" },
  { pattern: "Bash(sudo dd *)", description: "sudo raw disk write" },
  { pattern: "Bash(sudo chmod -R 777 *)", description: "open permissions recursively" },
  { pattern: "Bash(sudo chown -R *)", description: "recursive ownership change" },
  { pattern: "Bash(*> /dev/sd*)", description: "write to raw disk device" },
  { pattern: "Bash(*> /dev/nvme*)", description: "write to raw nvme device" },
  { pattern: "Bash(:(){ *)", description: "fork bomb" },
];

export default function nixpiPermissionsExtension(pi: ExtensionAPI) {
  let config: PermissionConfig = {};

  const getAllDeny = () => [
    ...NIXPI_DENY,
    ...((config.deny ?? []).map((pattern) => ({ pattern })) as Array<{ pattern: string }>),
  ];

  const getBlockReason = (command: string): string | undefined => {
    for (const rule of getAllDeny()) {
      if (matchesRule("Bash", command, rule.pattern)) {
        const suffix = rule.description ? ` (${rule.description})` : "";
        return `Blocked: matches deny rule "${rule.pattern}"${suffix}`;
      }
    }
    return undefined;
  };

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig(ctx.cwd);
    const denyCount = (config.deny?.length ?? 0) + NIXPI_DENY.length;
    if (ctx.hasUI) {
      ctx.ui.notify(`nixpi-permissions loaded: deny-only mode, ${denyCount} deny rules`, "info");
    }
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input?.command;
    if (typeof command !== "string") return undefined;

    const reason = getBlockReason(command);
    if (!reason) return undefined;

    return {
      block: true,
      reason,
    };
  });

  pi.on("user_bash", async (event) => {
    if (typeof event.command !== "string") return undefined;

    const reason = getBlockReason(event.command);
    if (!reason) return undefined;

    return {
      result: {
        output: reason,
        exitCode: 1,
        cancelled: false,
        truncated: false,
      },
    };
  });
}
