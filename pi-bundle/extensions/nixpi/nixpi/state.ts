import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { EVOLUTION_AREAS, EVOLUTION_RISKS, EVOLUTION_STATUSES } from "./constants.ts";
import { agentDir, atomicWriteText, evolutionDir, slugify, today } from "./shared.ts";

export type UpdateStatus = {
  available: boolean;
  behindBy: number;
  checked: string;
  branch?: string;
  notified?: boolean;
};

export async function ensureEvolutionNote(params: {
  title: string;
  summary?: string;
  area?: (typeof EVOLUTION_AREAS)[number];
  risk?: (typeof EVOLUTION_RISKS)[number];
  status?: (typeof EVOLUTION_STATUSES)[number];
}) {
  const slug = slugify(params.title);
  const path = join(evolutionDir(), `${slug}.md`);

  return withFileMutationQueue(path, async () => {
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
      atomicWriteText(path, content);
      return { created: true, path };
    }

    return { created: false, path };
  });
}

export function updateStatusPath() {
  return join(agentDir(), "update-status.json");
}

export function readUpdateStatus(): UpdateStatus | null {
  try {
    return JSON.parse(readFileSync(updateStatusPath(), "utf-8")) as UpdateStatus;
  } catch {
    return null;
  }
}

export async function writeUpdateStatus(status: UpdateStatus) {
  const p = updateStatusPath();
  return withFileMutationQueue(p, async () => {
    atomicWriteText(p, JSON.stringify(status, null, 2) + "\n");
  });
}
