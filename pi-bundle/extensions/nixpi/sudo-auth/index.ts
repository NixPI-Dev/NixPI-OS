/**
 * sudo-auth — replaces sudo-handoff + tmux-manager
 *
 * Instead of opening tmux panes for privileged commands, this extension:
 * - Tracks sudo credential state via `sudo -n true` probes
 * - Shows a footer status indicator (active/inactive + approximate timer)
 * - Intercepts `bash` tool calls containing `sudo` and rewrites to `sudo -n`
 * - Prompts the user to run `sudo -v` in another session when needed
 *
 * Commands:
 *   /sudo-status    — show full sudo credential state
 *   /sudo-refresh   — probe sudo -n true and update footer
 *   /sudo-invalidate — run sudo -k to invalidate credentials
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── Sudo detection ────────────────────────────────────────────────────────

const SUDO_RE = /\bsudo\b/;

// ── Sudo state ────────────────────────────────────────────────────────────

interface SudoState {
  lastConfirmed: number | null;
  estimatedTimeoutMs: number;
  lastKnownActive: boolean;
}

const state: SudoState = {
  lastConfirmed: null,
  estimatedTimeoutMs: 5 * 60 * 1000, // 5 min default
  lastKnownActive: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function run(cmd: string, args: string[], signal?: AbortSignal) {
  try {
    await promisify(execFile)(cmd, args, {
      signal,
      env: process.env,
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function probeSudo(signal?: AbortSignal): Promise<boolean> {
  const ok = await run("sudo", ["-n", "true"], signal);
  if (ok) {
    state.lastConfirmed = Date.now();
    state.lastKnownActive = true;
  } else {
    state.lastKnownActive = false;
  }
  return ok;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `~${min}m${sec.toString().padStart(2, "0")}s`;
}

function estimatedRemaining(): number {
  if (!state.lastConfirmed) return 0;
  return state.estimatedTimeoutMs - (Date.now() - state.lastConfirmed);
}

function statusText(theme: any): string {
  if (!state.lastKnownActive && state.lastConfirmed === null) {
    return theme.fg("dim", "sudo: ?");
  }
  if (!state.lastKnownActive) {
    return theme.fg("dim", "sudo: inactive");
  }
  const remaining = estimatedRemaining();
  if (remaining <= 60_000) {
    return theme.fg("warning", `sudo: ${formatRemaining(remaining)}`);
  }
  return theme.fg("success", `sudo: ${formatRemaining(remaining)}`);
}

function updateFooter(ctx: any) {
  if (!ctx.hasUI) return;
  const theme = ctx.ui.theme;
  ctx.ui.setStatus("sudo-auth", statusText(theme));
}

// ── ensureSudo — the core flow ────────────────────────────────────────────

async function ensureSudo(ctx: any, signal?: AbortSignal): Promise<boolean> {
  // Fast path: already active
  if (await probeSudo(signal)) {
    updateFooter(ctx);
    return true;
  }

  updateFooter(ctx);

  // Slow path: need user to authenticate
  if (!ctx.hasUI) {
    ctx.ui.notify?.("Sudo required but no interactive UI available.", "error");
    return false;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const hint =
      attempt > 0
        ? "Still no sudo credentials detected. Try running 'sudo -v' again in another terminal or SSH session."
        : "This action requires sudo.";

    const confirmed = await ctx.ui.confirm(
      "Privilege Required",
      `${hint}\n\nOpen another terminal or SSH session and run:\n  sudo -v\n\nThen press Enter here.`,
    );

    if (!confirmed) return false;

    if (await probeSudo(signal)) {
      updateFooter(ctx);
      ctx.ui.notify("Sudo authenticated.", "info");
      return true;
    }

    updateFooter(ctx);
  }

  ctx.ui.notify("Sudo authentication failed after 3 attempts.", "error");
  return false;
}

// ── Exported for use by other extensions (os) ──────────────────────────────

// We store the ensureSudo function on a shared event so the os extension
// can import it without a hard file dependency. The os extension will
// pick it up via pi.events.emit("pi-sudo-auth:ensure", { ensureSudo }).

// ── Extension ─────────────────────────────────────────────────────────────

export default function sudoAuthExtension(pi: ExtensionAPI) {
  // ── Bash tool interception ───────────────────────────────────────────────
  // Replaces sudo-handoff: instead of opening a tmux pane, rewrite sudo
  // commands to use sudo -n after ensuring credentials are available.

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input.command;
    if (typeof command !== "string" || !SUDO_RE.test(command)) return undefined;

    // Non-interactive mode: can't prompt the user
    if (!ctx.hasUI) {
      return {
        content: [
          {
            type: "text",
            text:
              "Blocked sudo bash command: sudo-auth requires interactive UI. " +
              "Use a structured tool like nixos_update/systemd_control if applicable.",
          },
        ],
        details: { ok: false, reason: "no-ui" },
        isError: true,
      };
    }

    // Interactive: ensure sudo credentials are available
    const hasSudo = await ensureSudo(ctx);
    if (!hasSudo) {
      return {
        content: [{ type: "text", text: "Cancelled: sudo authentication not available." }],
        details: { ok: false, reason: "no-sudo" },
      };
    }

    // Rewrite: sudo → sudo -n (non-interactive)
    event.input.command = command.replace(/\bsudo\b(?!\s+-n\b)/, "sudo -n");
    return undefined; // let the tool proceed with the rewritten command
  });

  // ── Footer status ───────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Initial probe (best-effort, don't block startup)
    probeSudo().then(() => updateFooter(ctx));

    // Periodic footer update (every 30s) — just updates the timer display,
    // does NOT run sudo -n true on a timer.
    const timer = setInterval(() => {
      const remaining = estimatedRemaining();
      if (state.lastKnownActive && remaining <= 0) {
        // Probably expired — update display but don't probe
        state.lastKnownActive = false;
      }
      updateFooter(ctx);
    }, 30_000);

    pi.on("session_shutdown", async () => {
      clearInterval(timer);
    });
  });

  // ── Commands ─────────────────────────────────────────────────────────────

  pi.registerCommand("sudo-status", {
    description: "Show sudo credential state (active/inactive, time remaining)",
    handler: async (_args, ctx) => {
      const active = await probeSudo();
      updateFooter(ctx);

      const lines: string[] = [];
      lines.push(`sudo: ${active ? "active" : "inactive"}`);
      if (state.lastConfirmed) {
        const when = new Date(state.lastConfirmed).toISOString().replace("T", " ").slice(0, 19);
        lines.push(`last confirmed: ${when}`);
        lines.push(`estimated timeout: ${state.estimatedTimeoutMs / 1000 / 60}m (default)`);
        const remaining = estimatedRemaining();
        lines.push(`remaining: ${formatRemaining(remaining)}`);
      }
      lines.push(`\nProbe now: /sudo-refresh`);
      lines.push(`Invalidate: /sudo-invalidate`);

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("sudo-refresh", {
    description: "Probe sudo -n true and update the footer status",
    handler: async (_args, ctx) => {
      const active = await probeSudo();
      updateFooter(ctx);

      if (active) {
        ctx.ui.notify(`✓ sudo is active (${formatRemaining(estimatedRemaining())} remaining)`, "info");
      } else {
        ctx.ui.notify("✗ sudo is inactive — run 'sudo -v' in another terminal to authenticate", "warning");
      }
    },
  });

  pi.registerCommand("sudo-invalidate", {
    description: "Invalidate sudo credentials (run sudo -k)",
    handler: async (_args, ctx) => {
      await run("sudo", ["-k"]);
      state.lastKnownActive = false;
      state.lastConfirmed = null;
      updateFooter(ctx);
      ctx.ui.notify("Sudo credentials invalidated.", "info");
    },
  });

  // ── Expose ensureSudo for the os extension ──────────────────────────────
  // The os extension emits "pi-sudo-auth:request" and gets back the
  // ensureSudo function via a synchronous event.

  pi.events.on("pi-sudo-auth:request", () => {
    return { ensureSudo, probeSudo, updateFooter };
  });
}
