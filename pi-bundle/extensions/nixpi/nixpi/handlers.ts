import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_SYSTEMD_UNITS, NIXOS_UPDATE_ACTIONS, PROPOSAL_ACTIONS, SYSTEMD_ACTIONS } from "./constants.ts";
import { currentHostName, shellEscape, systemFlakeDir, truncate, run, confirm } from "./shared.ts";
import { runPrivileged } from "./sudo.ts";
import { readUpdateStatus } from "./state.ts";

function currentGenerationLine(stdout: string) {
  const lines = stdout
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return "No generation info available.";

  const dataLines = lines.filter((line, index) => !(index === 0 && /^Generation\b/i.test(line.trim())));
  const currentFromBooleanColumn = dataLines.find((line) => /\bTrue\s*$/.test(line));
  if (currentFromBooleanColumn) return currentFromBooleanColumn.replace(/\bTrue\s*$/, "(current)");

  const currentFromMarker = dataLines.find((line) => /\(current\)|\bcurrent\b/i.test(line));
  if (currentFromMarker) return currentFromMarker;

  return dataLines[0] ?? lines[0] ?? "No generation info available.";
}

function normalizedServiceName(service: string) {
  return service.endsWith(".service") ? service.slice(0, -8) : service;
}

function isAllowedService(service: string) {
  const normalized = normalizedServiceName(service);
  return normalized.startsWith("nixpi-") || ALLOWED_SYSTEMD_UNITS.has(normalized);
}

export async function handleSystemHealth(signal?: AbortSignal) {
  const [nixos, ps, df, loadavg, meminfo, uptime] = await Promise.all([
    run("nixos-rebuild", ["list-generations"], signal),
    run("podman", ["ps", "--format", "json", "--filter", "name=nixpi-"], signal),
    run("df", ["-h", "/", "/var", "/home"], signal),
    run("cat", ["/proc/loadavg"], signal),
    run("free", ["-h", "--si"], signal),
    run("uptime", ["-p"], signal),
  ]);

  const sections: string[] = [];
  sections.push(
    nixos.exitCode === 0
      ? `## OS\nNixOS — ${currentGenerationLine(nixos.stdout)}`
      : "## OS\n(nixos-rebuild unavailable)",
  );

  if (ps.exitCode === 0) {
    try {
      const containers = JSON.parse(ps.stdout || "[]") as Array<{ Names?: string[]; Status?: string; State?: string }>;
      if (containers.length === 0) {
        sections.push("## Containers\nNo nixpi-* containers running.");
      } else {
        sections.push(
          "## Containers\n" +
            containers
              .map((c) => `- ${((c.Names ?? []).join(", ") || "unknown")}: ${c.Status ?? c.State ?? "unknown"}`)
              .join("\n"),
        );
      }
    } catch {
      sections.push("## Containers\n(parse error)");
    }
  }

  if (df.exitCode === 0) sections.push(`## Disk Usage\n\`\`\`\n${df.stdout.trim()}\n\`\`\``);

  const systemLines: string[] = [];
  if (loadavg.exitCode === 0) {
    const parts = loadavg.stdout.trim().split(/\s+/);
    systemLines.push(`- Load: ${parts.slice(0, 3).join(" ")}`);
  }
  if (uptime.exitCode === 0) systemLines.push(`- Uptime: ${uptime.stdout.trim()}`);
  if (meminfo.exitCode === 0) {
    const memLine = meminfo.stdout.split("\n").find((line) => line.startsWith("Mem:"));
    if (memLine) {
      const cols = memLine.split(/\s+/);
      systemLines.push(`- Memory: ${cols[2] ?? "?"} used / ${cols[1] ?? "?"} total`);
    }
  }
  if (systemLines.length > 0) sections.push(`## System\n${systemLines.join("\n")}`);

  return {
    content: [{ type: "text" as const, text: truncate(sections.join("\n\n")) }],
    details: { ok: true, sections },
  };
}

export async function handleNixosUpdate(
  pi: ExtensionAPI,
  action: (typeof NIXOS_UPDATE_ACTIONS)[number],
  signal: AbortSignal | undefined,
  ctx: any,
) {
  if (action === "status") {
    const gen = await run("nixos-rebuild", ["list-generations"], signal);
    const text = gen.exitCode === 0 ? gen.stdout.trim() || "No generation info available." : gen.stderr || "Failed to list generations.";
    return {
      content: [{ type: "text" as const, text: truncate(text) }],
      details: { ok: gen.exitCode === 0, exitCode: gen.exitCode },
      ...(gen.exitCode !== 0 ? { isError: true } : {}),
    };
  }

  if (action === "rollback") {
    return runPrivileged(pi, ctx, signal, "sudo nixos-rebuild switch --rollback", "OS rollback");
  }

  const flakeDir = systemFlakeDir();
  const flakeRef = `${flakeDir}#${currentHostName()}`;
  if (!existsSync(join(flakeDir, "flake.nix"))) {
    return {
      content: [{ type: "text" as const, text: `System flake not found at ${flakeDir}.` }],
      details: { ok: false, flakeDir },
      isError: true,
    };
  }

  return runPrivileged(
    pi,
    ctx,
    signal,
    `sudo nixos-rebuild switch --flake ${shellEscape(flakeRef)}`,
    `OS apply — nixos-rebuild switch --flake ${flakeRef}`,
  );
}

export async function handleSystemdControl(
  pi: ExtensionAPI,
  service: string,
  action: (typeof SYSTEMD_ACTIONS)[number],
  signal: AbortSignal | undefined,
  ctx: any,
) {
  if (!isAllowedService(service)) {
    return {
      content: [{ type: "text" as const, text: `Security error: service ${service} is not allowed.` }],
      details: { ok: false, validationError: true },
      isError: true,
    };
  }

  const unit = service.endsWith(".service") ? service : `${service}.service`;

  if (action === "status") {
    const result = await run("systemctl", [action, unit, "--no-pager"], signal);
    const text = result.stdout || result.stderr || `systemctl ${action} ${unit} completed.`;
    return {
      content: [{ type: "text" as const, text: truncate(text) }],
      details: { ok: result.exitCode === 0, exitCode: result.exitCode, unit },
      ...(result.exitCode !== 0 ? { isError: true } : {}),
    };
  }

  return runPrivileged(
    pi,
    ctx,
    signal,
    `sudo systemctl ${action} ${shellEscape(unit)} --no-pager`,
    `systemctl ${action} ${unit}`,
  );
}

export async function handleScheduleReboot(
  pi: ExtensionAPI,
  delayMinutes: number,
  signal: AbortSignal | undefined,
  ctx: any,
) {
  const delay = Math.max(1, Math.min(7 * 24 * 60, Math.round(delayMinutes)));
  return runPrivileged(
    pi,
    ctx,
    signal,
    `sudo shutdown -r +${delay}`,
    `Schedule reboot in ${delay} minute(s)`,
  );
}

export async function handleUpdateStatus() {
  const status = readUpdateStatus();
  if (!status) {
    return {
      content: [{ type: "text" as const, text: "No update status available yet. The update timer may not have run." }],
      details: { ok: false },
    };
  }
  const lines = [
    `Available: ${status.available}`,
    `Behind by: ${status.behindBy} commit(s)`,
    `Checked: ${status.checked}`,
  ];
  if (status.branch) lines.push(`Branch: ${status.branch}`);
  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    details: { ok: true, ...status },
  };
}

export async function handleNixConfigProposal(
  pi: ExtensionAPI,
  action: (typeof PROPOSAL_ACTIONS)[number],
  signal: AbortSignal | undefined,
  ctx: any,
) {
  const repoDir = systemFlakeDir();
  if (!existsSync(join(repoDir, ".git"))) {
    return {
      content: [{ type: "text" as const, text: `NixPI repo not found at ${repoDir}. Expected a git checkout there.` }],
      details: { ok: false, repoDir },
      isError: true,
    };
  }

  if (action === "status") {
    const [branch, remote, status, log] = await Promise.all([
      run("git", ["branch", "--show-current"], signal, repoDir),
      run("git", ["remote", "-v"], signal, repoDir),
      run("git", ["status", "--short"], signal, repoDir),
      run("git", ["log", "--oneline", "-8"], signal, repoDir),
    ]);
    const lines = [
      `Repo: ${repoDir}`,
      `Branch: ${branch.stdout.trim() || "(unknown)"}`,
      `Remote: ${remote.stdout.split("\n")[0]?.trim() || "(none)"}`,
      "",
      "Working tree:",
      status.stdout.trim() || "Clean",
      "",
      "Recent commits:",
      log.stdout.trim() || "(none)",
    ];
    return {
      content: [{ type: "text" as const, text: truncate(lines.join("\n")) }],
      details: { ok: true, repoDir, clean: !status.stdout.trim() },
    };
  }

  if (action === "diff") {
    const [unstaged, staged] = await Promise.all([
      run("git", ["diff", "--stat", "HEAD"], signal, repoDir),
      run("git", ["diff", "--stat", "--cached"], signal, repoDir),
    ]);
    return {
      content: [{ type: "text" as const, text: truncate(`Unstaged diff:\n${unstaged.stdout.trim() || "(none)"}\n\nStaged diff:\n${staged.stdout.trim() || "(none)"}`) }],
      details: { ok: true },
    };
  }

  if (action === "validate") {
    const result = await run("nix", ["flake", "check", "--no-build"], signal, repoDir);
    const ok = result.exitCode === 0;
    return {
      content: [{ type: "text" as const, text: ok ? `Flake check passed for ${repoDir}.` : truncate(`Flake check failed:\n${result.stderr || result.stdout}`) }],
      details: { ok, exitCode: result.exitCode },
      ...(ok ? {} : { isError: true }),
    };
  }

  if (action === "commit") {
    const statusResult = await run("git", ["status", "--short"], signal, repoDir);
    if (!statusResult.stdout.trim()) {
      return {
        content: [{ type: "text" as const, text: "Nothing to commit — working tree is clean." }],
        details: { ok: true, noop: true },
      };
    }
    const denied = await confirm(ctx, `git commit all changes in ${repoDir}`);
    if (denied) return { content: [{ type: "text" as const, text: denied }], details: { ok: false }, isError: true };

    const msg = `Update NixPI — ${new Date().toISOString().slice(0, 10)}`;
    await run("git", ["add", "-A"], signal, repoDir);
    const commit = await run("git", ["commit", "-m", msg], signal, repoDir);
    const ok = commit.exitCode === 0;
    return {
      content: [{ type: "text" as const, text: truncate(ok ? `Committed:\n${commit.stdout.trim()}` : commit.stderr || commit.stdout) }],
      details: { ok, exitCode: commit.exitCode },
      ...(ok ? {} : { isError: true }),
    };
  }

  if (action === "push") {
    const denied = await confirm(ctx, `git push from ${repoDir}`);
    if (denied) return { content: [{ type: "text" as const, text: denied }], details: { ok: false }, isError: true };

    const branch = await run("git", ["branch", "--show-current"], signal, repoDir);
    const branchName = branch.stdout.trim();
    const result = await run("git", ["push", "origin", branchName], signal, repoDir);
    const ok = result.exitCode === 0;
    return {
      content: [{ type: "text" as const, text: truncate(result.stdout || result.stderr || `Pushed ${branchName}.`) }],
      details: { ok, exitCode: result.exitCode },
      ...(ok ? {} : { isError: true }),
    };
  }

  const flakeRef = `${repoDir}#${currentHostName()}`;
  return runPrivileged(
    pi,
    ctx,
    signal,
    `sudo nixos-rebuild switch --flake ${shellEscape(flakeRef)}`,
    `nixos-rebuild switch --flake ${flakeRef}`,
  );
}
