import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const PERSONA_LAYERS = [
  { title: "Soul", file: "soul.md" },
  { title: "Body", file: "body.md" },
  { title: "Faculty", file: "faculty.md" },
  { title: "Skill", file: "skill.md" },
] as const;

type Guardrail = { tool: string; pattern: RegExp; label: string };
type SavedContext = { savedAt: string; host?: string; cwd?: string };
type BlueprintVersions = {
  packageVersion: string;
  seeded: Record<string, string>;
  seededHashes: Record<string, string>;
  updatesAvailable: Record<string, string>;
};

const DEFAULT_PACKAGE_VERSION = "1";
const execFileAsync = promisify(execFile);

function homeDir() {
  return process.env.HOME || "/tmp";
}

function agentDir() {
  return join(homeDir(), ".pi", "agent");
}

function contextPath() {
  return join(agentDir(), "context.json");
}

function versionsPath() {
  return join(agentDir(), "blueprint-versions.json");
}

function guardrailsDestPath() {
  return join(agentDir(), "guardrails.yaml");
}

function normalizeCommand(command: string) {
  return command.replace(/\s+/g, " ").trim();
}

async function isGitDirty(repoDir: string) {
  try {
    const result = await execFileAsync("git", ["status", "--short"], {
      cwd: repoDir,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    return (result.stdout ?? "").trim().length > 0;
  } catch {
    return false;
  }
}

function nixpiRepoDir() {
  return join(homeDir(), "Workspace", "NixPI");
}

function isProtectedApplyCommand(command: string) {
  return /\bnixos-rebuild\s+switch\b/.test(command) && command.includes(nixpiRepoDir());
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function readText(path: string) {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function readJson<T>(path: string): T | null {
  try {
    const raw = readText(path);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readBlueprintVersions(): BlueprintVersions {
  return (
    readJson<BlueprintVersions>(versionsPath()) ?? {
      packageVersion: "0",
      seeded: {},
      seededHashes: {},
      updatesAvailable: {},
    }
  );
}

function loadPackagedGuardrails() {
  return readText(join(__dirname, "guardrails.yaml")) ?? "rules: []\n";
}

function seedBlueprintFile(key: string, srcContent: string, destPath: string, version: string) {
  const versions = readBlueprintVersions();
  const srcHash = hashContent(srcContent);
  const destContent = readText(destPath);

  if (destContent == null) {
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, srcContent, "utf-8");
    versions.seeded[key] = version;
    versions.seededHashes[key] = srcHash;
    delete versions.updatesAvailable[key];
    versions.packageVersion = version;
    writeJson(versionsPath(), versions);
    return { seeded: true, updated: false, pending: false };
  }

  const destHash = hashContent(destContent);
  const previousSeedHash = versions.seededHashes[key];

  if (destHash === srcHash) {
    versions.seeded[key] = version;
    versions.seededHashes[key] = srcHash;
    delete versions.updatesAvailable[key];
    versions.packageVersion = version;
    writeJson(versionsPath(), versions);
    return { seeded: false, updated: false, pending: false };
  }

  if (previousSeedHash && destHash === previousSeedHash) {
    writeFileSync(destPath, srcContent, "utf-8");
    versions.seeded[key] = version;
    versions.seededHashes[key] = srcHash;
    delete versions.updatesAvailable[key];
    versions.packageVersion = version;
    writeJson(versionsPath(), versions);
    return { seeded: false, updated: true, pending: false };
  }

  versions.updatesAvailable[key] = version;
  versions.packageVersion = version;
  writeJson(versionsPath(), versions);
  return { seeded: false, updated: false, pending: true };
}

function parseGuardrails(yaml: string): Guardrail[] {
  const lines = yaml.split(/\r?\n/);
  const guardrails: Guardrail[] = [];
  let currentTool: string | null = null;
  let currentPattern: string | null = null;
  let currentLabel: string | null = null;

  const flush = () => {
    if (!currentTool || !currentPattern || !currentLabel) return;
    try {
      guardrails.push({ tool: currentTool, pattern: new RegExp(currentPattern), label: currentLabel });
    } catch {
      // ignore invalid regexes
    }
    currentPattern = null;
    currentLabel = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const toolMatch = line.match(/^- tool:\s*(.+)$/);
    if (toolMatch) {
      flush();
      currentTool = toolMatch[1].trim().replace(/^['\"]|['\"]$/g, "");
      continue;
    }

    const patternMatch = line.match(/^- pattern:\s*(.+)$/);
    if (patternMatch) {
      flush();
      currentPattern = patternMatch[1].trim().replace(/^['\"]|['\"]$/g, "");
      continue;
    }

    const labelMatch = line.match(/^label:\s*(.+)$/);
    if (labelMatch) {
      currentLabel = labelMatch[1].trim().replace(/^['\"]|['\"]$/g, "");
      flush();
      continue;
    }
  }

  flush();
  return guardrails;
}

function saveContext(data: SavedContext) {
  writeJson(contextPath(), data);
}

function loadContext(): SavedContext | null {
  return readJson<SavedContext>(contextPath());
}

function restoredContextBlock(data: SavedContext) {
  const lines = ["\n\n[RESTORED CONTEXT]"];
  lines.push(`Saved at: ${data.savedAt}`);
  if (data.host) lines.push(`Previous host: ${data.host}`);
  if (data.cwd) lines.push(`Previous cwd: ${data.cwd}`);
  return lines.join("\n");
}

function knowledgeDir() {
  return join(homeDir(), "Workspace", "Knowledge");
}

function personaDir() {
  return join(knowledgeDir(), "pages", "projects", "nixpi", "persona");
}

function stripFrontmatter(markdown: string) {
  if (!markdown.startsWith("---\n")) return markdown.trim();
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return markdown.trim();
  return markdown.slice(end + 5).trim();
}

function loadPersonaPromptBlock() {
  const sections: string[] = [];
  for (const layer of PERSONA_LAYERS) {
    const path = join(personaDir(), layer.file);
    if (!existsSync(path)) continue;
    const content = stripFrontmatter(readFileSync(path, "utf-8"));
    sections.push(`### ${layer.title}\n\n${content}`);
  }
  if (sections.length === 0) return "";
  return `\n\n[PI PERSONA]\n${sections.join("\n\n")}`;
}

export default function personaExtension(pi: ExtensionAPI) {
  let guardrails: Guardrail[] | null = null;
  let restoredContext = loadContext();

  pi.on("session_start", async (_event, ctx) => {
    const result = seedBlueprintFile(
      "guardrails.yaml",
      loadPackagedGuardrails(),
      guardrailsDestPath(),
      DEFAULT_PACKAGE_VERSION,
    );

    const yaml = readText(guardrailsDestPath()) ?? loadPackagedGuardrails();
    guardrails = parseGuardrails(yaml);

    if (result.pending && ctx.hasUI) {
      ctx.ui.setWidget("persona-blueprints", ["guardrails update available — local copy diverged from packaged default"]);
    }
    if ((result.seeded || result.updated) && ctx.hasUI) {
      ctx.ui.notify("Seeded/updated PI guardrails blueprint", "info");
    }
  });

  pi.on("before_agent_start", async (event) => {
    let systemPrompt = event.systemPrompt + loadPersonaPromptBlock();
    if (restoredContext) {
      systemPrompt += restoredContextBlock(restoredContext);
      restoredContext = null;
    }
    return { systemPrompt };
  });

  pi.on("tool_call", async (event) => {
    const repoDir = nixpiRepoDir();

    if (event.toolName === "nix_config_proposal") {
      const input = event.input as { action?: string };
      if (input.action === "apply" && (await isGitDirty(repoDir))) {
        return {
          block: true as const,
          reason: "Blocked apply: commit PI runtime changes before rebuild/apply.",
        };
      }
    }

    if (event.toolName === "nixos_update") {
      const input = event.input as { action?: string };
      if (input.action === "apply" && (await isGitDirty(repoDir))) {
        return {
          block: true as const,
          reason: "Blocked apply: commit NixPI changes before rebuilding the host.",
        };
      }
    }

    if (event.toolName !== "bash" || !guardrails) return;
    const input = event.input as { command?: string };
    const command = normalizeCommand(input.command ?? "");

    if (isProtectedApplyCommand(command) && (await isGitDirty(repoDir))) {
      return {
        block: true as const,
        reason: "Blocked nixos-rebuild apply from dirty NixPI repo: commit changes before apply.",
      };
    }

    for (const rule of guardrails) {
      if (rule.tool !== event.toolName) continue;
      if (rule.pattern.test(command)) {
        return { block: true as const, reason: `Blocked dangerous command: ${rule.label}` };
      }
    }
    return;
  });

  pi.on("session_before_compact", async (event, ctx) => {
    saveContext({
      savedAt: new Date().toISOString(),
      host: process.env.HOSTNAME || undefined,
      cwd: ctx.cwd,
    });
    return {
      compaction: {
        summary: [
          "COMPACTION GUIDANCE — preserve the following across summarization:",
          "1. Active tasks, pending decisions, and open implementation threads.",
          "2. Current repository and host context.",
          "3. Any user constraints, preferences, and follow-up requests.",
          `Tokens before compaction: ${event.preparation.tokensBefore}.`,
        ].join("\n"),
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      },
    };
  });
}
