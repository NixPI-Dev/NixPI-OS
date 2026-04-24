import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { confirm, run, truncate } from "./shared.ts";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

function commandWithNonInteractiveSudo(command: string) {
  return command.replace(/\bsudo\b/, "sudo -n");
}

function isSudoAuthFailure(result: { stdout: string; stderr: string; exitCode: number }) {
  if (result.exitCode === 0) return false;
  const text = `${result.stderr}\n${result.stdout}`;
  return /a password is required|a terminal is required|no tty present|authentication is required|try again/i.test(text);
}

async function hasCachedSudo(signal?: AbortSignal) {
  const result = await run("sudo", ["-n", "true"], signal);
  return result.exitCode === 0;
}

async function openSudoPanel(label: string, signal?: AbortSignal) {
  const script = `
    if command -v nixpi-tui >/dev/null 2>&1; then
      exec nixpi-tui sudo "$1"
    fi

    user="$USER"
    if [ -z "$user" ]; then
      user="alex"
    fi
    exec "/etc/profiles/per-user/$user/bin/nixpi-tui" sudo "$1"
  `;

  return run("bash", ["-lc", script, "nixpi-sudo", label], signal);
}

async function waitForSudo(timeoutMs: number, signal?: AbortSignal) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hasCachedSudo(signal)) return true;
    await sleep(1000, signal);
  }

  return false;
}

async function ensureSudo(_pi: ExtensionAPI, ctx: any, signal: AbortSignal | undefined, label: string): Promise<boolean> {
  if (await hasCachedSudo(signal)) return true;
  if (!ctx.hasUI) return false;

  const panel = await openSudoPanel(label, signal);
  if (panel.exitCode !== 0) {
    const details = truncate(panel.stderr || panel.stdout || "Could not open the NixPI sudo panel.");
    const ok = await ctx.ui.confirm(
      "Privilege Required",
      `${details}\n\nRun \`sudo -v\` in another terminal, then confirm here.`,
    );
    return ok ? hasCachedSudo(signal) : false;
  }

  ctx.ui.notify("Opened NixPI sudo panel. Enter the sudo password there to continue.", "warning");
  if (await waitForSudo(120_000, signal)) return true;

  const ok = await ctx.ui.confirm(
    "Privilege Required",
    "Still waiting for sudo authentication. Run `sudo -v` in the NixPI sudo panel or another terminal, then confirm here.",
  );
  return ok ? hasCachedSudo(signal) : false;
}

export async function runPrivileged(
  pi: ExtensionAPI,
  ctx: any,
  signal: AbortSignal | undefined,
  command: string,
  confirmationLabel: string,
): Promise<{ content: any[]; details: any; isError?: boolean }> {
  const denied = await confirm(ctx, confirmationLabel);
  if (denied) {
    return { content: [{ type: "text" as const, text: denied }], details: { ok: false }, isError: true };
  }

  let result = await run("bash", ["-c", commandWithNonInteractiveSudo(command)], signal);

  if (isSudoAuthFailure(result)) {
    const hasSudo = await ensureSudo(pi, ctx, signal, confirmationLabel);
    if (!hasSudo) {
      return {
        content: [{ type: "text" as const, text: `Cancelled: sudo authentication not available for ${confirmationLabel}.` }],
        details: { ok: false, reason: "no-sudo" },
      };
    }

    result = await run("bash", ["-c", commandWithNonInteractiveSudo(command)], signal);
  }

  const ok = result.exitCode === 0;
  const text = ok
    ? truncate(result.stdout || `(exit ${result.exitCode})`)
    : truncate(result.stderr || result.stdout || `Command failed (exit ${result.exitCode})`);

  return {
    content: [{ type: "text" as const, text }],
    details: { ok, exitCode: result.exitCode },
    ...(ok ? {} : { isError: true }),
  };
}
