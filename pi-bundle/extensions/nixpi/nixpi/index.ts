import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const EVOLUTION_AREAS = ["wiki", "persona", "extensions", "services", "system"] as const;
const EVOLUTION_RISKS = ["low", "medium", "high"] as const;
const EVOLUTION_STATUSES = ["proposed", "planning", "implementing", "validating", "reviewing", "applied", "rejected"] as const;

type BlueprintVersions = {
  packageVersion: string;
  seeded: Record<string, string>;
  seededHashes: Record<string, string>;
  updatesAvailable: Record<string, string>;
};

function agentDir() {
  return join(process.env.HOME || "/tmp", ".pi", "agent");
}

function versionsPath() {
  return join(agentDir(), "blueprint-versions.json");
}

function readVersions(): BlueprintVersions {
  try {
    if (!existsSync(versionsPath())) {
      return { packageVersion: "0", seeded: {}, seededHashes: {}, updatesAvailable: {} };
    }
    return JSON.parse(readFileSync(versionsPath(), "utf-8")) as BlueprintVersions;
  } catch {
    return { packageVersion: "0", seeded: {}, seededHashes: {}, updatesAvailable: {} };
  }
}

function writeVersions(versions: BlueprintVersions) {
  mkdirSync(agentDir(), { recursive: true });
  writeFileSync(versionsPath(), `${JSON.stringify(versions, null, 2)}\n`, "utf-8");
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function packagedGuardrailsPath() {
  return join(__dirname, "..", "persona", "guardrails.yaml");
}

function refreshGuardrailsBlueprint(versions: BlueprintVersions) {
  const srcPath = packagedGuardrailsPath();
  const destPath = join(agentDir(), "guardrails.yaml");
  if (!existsSync(srcPath)) {
    return { updated: false, message: `Packaged guardrails blueprint not found at ${srcPath}` };
  }

  const content = readFileSync(srcPath, "utf-8");
  const contentHash = hashContent(content);
  mkdirSync(agentDir(), { recursive: true });
  writeFileSync(destPath, content, "utf-8");

  versions.seeded["guardrails.yaml"] = versions.updatesAvailable["guardrails.yaml"] ?? versions.packageVersion ?? "1";
  versions.seededHashes["guardrails.yaml"] = contentHash;
  delete versions.updatesAvailable["guardrails.yaml"];
  writeVersions(versions);

  return { updated: true, message: `Updated guardrails blueprint from ${srcPath}` };
}

function knowledgeDir() {
  return join(process.env.HOME || "/tmp", "Workspace", "Knowledge");
}

function evolutionDir() {
  return join(knowledgeDir(), "pages", "projects", "nixpi", "evolution");
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

function renderStatus() {
  const versions = readVersions();
  const pending = Object.keys(versions.updatesAvailable);
  const seeded = Object.keys(versions.seeded);

  const lines = [
    `Blueprint package version: ${versions.packageVersion || "0"}`,
    `Seeded blueprints: ${seeded.length}`,
    `Pending updates: ${pending.length}`,
  ];

  if (pending.length > 0) {
    lines.push("", "Pending:");
    for (const key of pending) lines.push(`- ${key} -> ${versions.updatesAvailable[key]}`);
  }

  return { versions, text: lines.join("\n") };
}

export default function nixpiExtension(pi: ExtensionAPI) {
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
    description: "Show local PI blueprint state for seeded files such as guardrails.",
    promptSnippet: "Use nixpi_status when the user asks about blueprint seed/update state for PI runtime files.",
    parameters: Type.Object({}),
    async execute() {
      const status = renderStatus();
      return {
        content: [{ type: "text", text: status.text }],
        details: { ok: true, ...status.versions },
      };
    },
  });

  pi.registerCommand("nixpi", {
    description: "NixPI runtime status: /nixpi status | update-blueprints | evolution <title>",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = parts[0] || "status";
      if (subcommand === "status") {
        const status = renderStatus();
        if (ctx.hasUI) ctx.ui.notify(status.text, "info");
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

      if (subcommand === "update-blueprints") {
        const versions = readVersions();
        const pending = Object.keys(versions.updatesAvailable);
        if (pending.length === 0) {
          if (ctx.hasUI) ctx.ui.notify("All blueprints are up to date", "info");
          return;
        }

        const updates: string[] = [];
        if (versions.updatesAvailable["guardrails.yaml"]) {
          const result = refreshGuardrailsBlueprint(versions);
          updates.push(result.message);
        }

        const remaining = Object.keys(readVersions().updatesAvailable);
        if (remaining.length > 0) {
          if (ctx.hasUI) ctx.ui.notify(`Updated known blueprints. Still pending: ${remaining.join(", ")}`, "warning");
          return;
        }

        if (ctx.hasUI) {
          ctx.ui.notify(updates.join("\n") || "Updated blueprints.", "info");
        }
        return;
      }

      if (ctx.hasUI) ctx.ui.notify("Usage: /nixpi status | update-blueprints | evolution <title>", "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const status = renderStatus();
    if (ctx.hasUI) {
      ctx.ui.setStatus("nixpi", `NixPI blueprints: ${Object.keys(status.versions.updatesAvailable).length} pending`);
    }
  });
}
