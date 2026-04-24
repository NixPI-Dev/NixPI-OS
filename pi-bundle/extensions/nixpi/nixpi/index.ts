import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const execFileAsync = promisify(execFile);

// ── Constants ──────────────────────────────────────────────────────────────

const EVOLUTION_AREAS = ["wiki", "persona", "extensions", "services", "system"] as const;
const EVOLUTION_RISKS = ["low", "medium", "high"] as const;
const EVOLUTION_STATUSES = ["proposed", "planning", "implementing", "validating", "reviewing", "applied", "rejected"] as const;
const NIXOS_UPDATE_ACTIONS = ["status", "apply", "rollback"] as const;
const SYSTEMD_ACTIONS = ["start", "stop", "restart", "status"] as const;
const PROPOSAL_ACTIONS = ["status", "validate", "diff", "commit", "push", "apply"] as const;
const ALLOWED_SYSTEMD_UNITS = new Set(["sshd", "syncthing", "reaction"]);

// ── Shared helpers ─────────────────────────────────────────────────────────

function agentDir() {
  return join(process.env.HOME || "/tmp", ".pi", "agent");
}

function knowledgeDir() {
  return join(process.env.HOME || "/tmp", "NixPI", "wiki", "technical");
}

function evolutionDir() {
  return join(knowledgeDir(), "pages", "projects", "nixpi", "evolution");
}

function systemFlakeDir() {
  return join(process.env.HOME || "/home/alex", "NixPI", "host-configs", currentHostName());
}

function currentHostName() {
  if (process.env.HOSTNAME) return process.env.HOSTNAME;
  try {
    return readFileSync("/etc/hostname", "utf-8").trim();
  } catch {
    return "nixos";
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function truncate(text: string) {
  return text.length > 50_000 ? `${text.slice(0, 50_000)}\n... [truncated]` : text;
}

async function confirm(ctx: any, action: string) {
  if (!ctx.hasUI) return `Cannot perform "${action}" without interactive confirmation.`;
  const ok = await ctx.ui.confirm("Confirm action", `Allow: ${action}?`);
  return ok ? null : `User declined: ${action}`;
}

async function run(cmd: string, args: string[], signal?: AbortSignal, cwd?: string) {
  try {
    const result = await execFileAsync(cmd, args, {
      signal,
      cwd,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: typeof error.code === "number" ? error.code : 1,
    };
  }
}

// ── Sudo helper ────────────────────────────────────────────────────────────
// Try privileged commands with sudo -n first. If sudo needs a password,
// open a Zellij panel for the human to authenticate, then retry.

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

async function runPrivileged(
  _pi: ExtensionAPI,
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
    const hasSudo = await ensureSudo(_pi, ctx, signal, confirmationLabel);
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

// ── Evolution note ─────────────────────────────────────────────────────────

function ensureEvolutionNote(params: {
  title: string;
  summary?: string;
  area?: (typeof EVOLUTION_AREAS)[number];
  risk?: (typeof EVOLUTION_RISKS)[number];
  status?: (typeof EVOLUTION_STATUSES)[number];
}) {
  const slug = slugify(params.title);
  const path = join(evolutionDir(), `${slug}.md`);
  mkdirSync(evolutionDir(), { recursive: true });

  if (!existsSync(path)) {
    const date = today();
    const content = [
      "---",
      `id: evolution/nixpi-${slug}`,
      "schema_version: 1",
      "type: evolution",
      "object_type: evolution",
      `title: ${params.title}`,
      "tags: [nixpi, evolution]",
      "domain: technical",
      "areas: [ai, infrastructure]",
      `status: ${params.status ?? "proposed"}`,
      `risk: ${params.risk ?? "medium"}`,
      `area: ${params.area ?? "system"}`,
      "validation_level: working",
      `summary: ${params.summary ?? `${params.title} — NixPI evolution note.`}`,
      `created: ${date}`,
      `updated: ${date}`,
      "---",
      "",
      `# ${params.title}`,
      "",
      "## Motivation",
      "",
      "## Plan",
      "",
      "## Validation",
      "",
      "## Rollout",
      "",
      "## Rollback",
      "",
      "## Linked files",
      "",
    ].join("\n");
    writeFileSync(path, content, "utf-8");
    return { created: true, path };
  }

  return { created: false, path };
}

// ── Update status ──────────────────────────────────────────────────────────

function updateStatusPath() {
  return join(process.env.HOME || "/tmp", ".pi", "agent", "update-status.json");
}

type UpdateStatus = {
  available: boolean;
  behindBy: number;
  checked: string;
  branch?: string;
  notified?: boolean;
};

function readUpdateStatus(): UpdateStatus | null {
  try {
    return JSON.parse(readFileSync(updateStatusPath(), "utf-8")) as UpdateStatus;
  } catch {
    return null;
  }
}

function writeUpdateStatus(status: UpdateStatus) {
  const p = updateStatusPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(status, null, 2) + "\n", "utf-8");
}

// ── OS helpers ─────────────────────────────────────────────────────────────

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

// ── Tool handlers ──────────────────────────────────────────────────────────

async function handleSystemHealth(signal?: AbortSignal) {
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

async function handleNixosUpdate(
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

async function handleSystemdControl(
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

async function handleScheduleReboot(
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

async function handleUpdateStatus() {
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

async function handleNixConfigProposal(
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
      content: [{ type: "text" as const, text: truncate(
        `Unstaged diff:\n${unstaged.stdout.trim() || "(none)"}\n\nStaged diff:\n${staged.stdout.trim() || "(none)"}`
      )}],
      details: { ok: true },
    };
  }

  if (action === "validate") {
    const result = await run("nix", ["flake", "check", "--no-build"], signal, repoDir);
    const ok = result.exitCode === 0;
    return {
      content: [{ type: "text" as const, text: ok
        ? `Flake check passed for ${repoDir}.`
        : truncate(`Flake check failed:\n${result.stderr || result.stdout}`),
      }],
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

  // apply
  const flakeRef = `${repoDir}#${currentHostName()}`;
  return runPrivileged(
    pi,
    ctx,
    signal,
    `sudo nixos-rebuild switch --flake ${shellEscape(flakeRef)}`,
    `nixos-rebuild switch --flake ${flakeRef}`,
  );
}

// ── Extension entry ─────────────────────────────────────────────────────────

export default function nixpiExtension(pi: ExtensionAPI) {
  // ── NixPI runtime tools ────────────────────────────────────────────────

  pi.registerTool({
    name: "nixpi_evolution_note",
    label: "NixPI Evolution Note",
    description: "Create or resolve a scoped evolution note under the Knowledge folder for NixPI changes.",
    promptSnippet: "Use nixpi_evolution_note to scaffold tracked self-evolution work before implementing significant PI/NixPI changes.",
    promptGuidelines: [
      "Create or resolve an evolution note before substantial PI runtime changes.",
      "Use concise titles and fill in summary, area, and risk when known.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Evolution note title." }),
      summary: Type.Optional(Type.String({ description: "One-line why/what summary." })),
      area: Type.Optional(StringEnum(EVOLUTION_AREAS, { description: "Primary evolution area." })),
      risk: Type.Optional(StringEnum(EVOLUTION_RISKS, { description: "Estimated change risk." })),
      status: Type.Optional(StringEnum(EVOLUTION_STATUSES, { description: "Lifecycle status." })),
    }),
    async execute(_toolCallId, params) {
      const result = ensureEvolutionNote(params);
      return {
        content: [{ type: "text", text: `${result.created ? "Created" : "Resolved"} evolution note: ${result.path}` }],
        details: { ok: true, created: result.created, path: result.path },
      };
    },
  });

  pi.registerTool({
    name: "nixpi_status",
    label: "NixPI Status",
    description: "Show local NixPI runtime paths and extension state.",
    promptSnippet: "Use nixpi_status when the user asks about local NixPI runtime state.",
    parameters: Type.Object({}),
    async execute() {
      const host = currentHostName();
      const lines = [
        "NixPI runtime extension: active",
        `Host: ${host}`,
        `Agent dir: ${agentDir()}`,
        `Flake dir: ${systemFlakeDir()}`,
        `Evolution notes: ${evolutionDir()}`,
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { ok: true, agentDir: agentDir(), evolutionDir: evolutionDir() },
      };
    },
  });

  // ── NixOS host operation tools ─────────────────────────────────────────

  pi.registerTool({
    name: "update_status",
    label: "Update Status",
    description: "Read the NixPI update status — whether the local repo is behind its remote.",
    promptSnippet: "Use update_status to check whether there are upstream NixPI commits not yet pulled.",
    parameters: Type.Object({}),
    async execute() {
      return handleUpdateStatus();
    },
  });

  pi.registerTool({
    name: "nix_config_proposal",
    label: "Nix Config Proposal",
    description: "Inspect, validate, commit, push, and apply changes in the local NixPI host config repo.",
    promptSnippet: "Use nix_config_proposal to manage the NixPI repo lifecycle — status, validate, commit, push, apply.",
    promptGuidelines: [
      "Use action=status first to understand the working tree.",
      "Use action=validate before commit or apply.",
      "Use action=commit then action=push to publish changes.",
      "Use action=apply to rebuild the current host from the repo.",
      "Always confirm with the user before commit, push, or apply.",
    ],
    parameters: Type.Object({
      action: StringEnum(PROPOSAL_ACTIONS, {
        description: "status: repo state. validate: nix flake check. diff: working tree diff. commit: stage+commit. push: push branch. apply: nixos-rebuild switch.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return handleNixConfigProposal(pi, params.action, signal, ctx);
    },
  });

  pi.registerTool({
    name: "system_health",
    label: "System Health",
    description: "Composite health check: OS image status, containers, disk usage, system load, and memory.",
    promptSnippet: "Use system_health for a broad host snapshot before deeper diagnosis.",
    promptGuidelines: [
      "Run system_health first when the user asks about host state, health, or troubleshooting.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      return handleSystemHealth(signal);
    },
  });

  pi.registerTool({
    name: "nixos_update",
    label: "NixOS Update Management",
    description: "Manage NixOS updates: list generations, apply the current host flake, or rollback to the previous generation.",
    promptSnippet: "Use nixos_update to inspect generations or rebuild/rollback the current host declaratively.",
    promptGuidelines: [
      "Use action=status before apply or rollback.",
      "apply runs sudo -n nixos-rebuild switch against ~/NixPI/host-configs/<current-host>#<current-host>.",
      "rollback runs sudo -n nixos-rebuild switch --rollback and requires confirmation.",
    ],
    parameters: Type.Object({
      action: StringEnum(NIXOS_UPDATE_ACTIONS, {
        description: "status: list generations. apply: rebuild current host. rollback: switch to previous generation.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return handleNixosUpdate(pi, params.action, signal, ctx);
    },
  });

  pi.registerTool({
    name: "schedule_reboot",
    label: "Schedule Reboot",
    description: "Schedule a system reboot after a delay in minutes.",
    promptSnippet: "Use schedule_reboot when a rebuild or maintenance flow needs a delayed restart with explicit confirmation.",
    promptGuidelines: [
      "Only use schedule_reboot after the user requests or approves a reboot.",
      "Prefer a short explicit delay like 1-5 minutes unless the user requests otherwise.",
    ],
    parameters: Type.Object({
      delay_minutes: Type.Number({ description: "Minutes to wait before rebooting", default: 1 }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return handleScheduleReboot(pi, params.delay_minutes, signal, ctx);
    },
  });

  pi.registerTool({
    name: "systemd_control",
    label: "Systemd Service Control",
    description: "Manage a small allowlisted set of services: nixpi-*, sshd, syncthing, and reaction.",
    promptSnippet: "Use systemd_control for safe service inspection and minimal remediation instead of ad-hoc shell service commands.",
    promptGuidelines: [
      "Prefer action=status first.",
      "Only use mutations after the user asks or agrees.",
    ],
    parameters: Type.Object({
      service: Type.String({ description: "Service name, for example sshd, syncthing, reaction, or a nixpi-* unit." }),
      action: StringEnum(SYSTEMD_ACTIONS, { description: "Systemd action to run." }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return handleSystemdControl(pi, params.service, params.action, signal, ctx);
    },
  });

  // ── Commands ────────────────────────────────────────────────────────────

  pi.registerCommand("nixpi", {
    description: "NixPI runtime status: /nixpi status | evolution <title>",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = parts[0] || "status";
      if (subcommand === "status") {
        const host = currentHostName();
        const lines = [
          "NixPI runtime extension: active",
          `Host: ${host}`,
          `Agent dir: ${agentDir()}`,
          `Flake dir: ${systemFlakeDir()}`,
          `Evolution notes: ${evolutionDir()}`,
        ];
        if (ctx.hasUI) ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (subcommand === "evolution") {
        const title = args.trim().replace(/^evolution\s+/, "").trim();
        if (!title) {
          if (ctx.hasUI) ctx.ui.notify("Usage: /nixpi evolution <title>", "warning");
          return;
        }
        const result = ensureEvolutionNote({ title });
        if (ctx.hasUI) ctx.ui.notify(`${result.created ? "Created" : "Resolved"} evolution note: ${result.path}`, "info");
        return;
      }

      if (ctx.hasUI) ctx.ui.notify("Usage: /nixpi status | evolution <title>", "warning");
    },
  });

  // ── Hooks ───────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus("nixpi", "NixPI runtime: active");
    }
  });

  pi.on("before_agent_start", async (event) => {
    const host = currentHostName();
    const flakeDir = systemFlakeDir();
    let note = `\n\n[OS CONTEXT]\nCurrent host: ${host}\nCanonical flake repo: ${flakeDir}\nUse system_health for diagnosis and nixos_update for declarative rebuilds.`;

    const updateStatus = readUpdateStatus();
    if (updateStatus?.available && !updateStatus.notified) {
      writeUpdateStatus({ ...updateStatus, notified: true });
      note += `\n\n[UPDATE AVAILABLE] The NixPI repo is ${updateStatus.behindBy} commit(s) behind origin/${updateStatus.branch ?? "main"}. Inform the user and offer to pull and apply.`;
    }

    return { systemPrompt: event.systemPrompt + note };
  });
}
