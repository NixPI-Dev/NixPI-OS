import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "chrono-node";
import { getPersonalWikiRoot, rebuildPersonalRegistry } from "./wiki.js";

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "task";
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0] ? word[0].toUpperCase() + word.slice(1) : word)
    .join(" ");
}

function cleanActionText(value: string): string {
  return value
    .replace(/^[\s,.-]+/, "")
    .replace(/[\s,.-]+$/, "")
    .replace(/^(to|for|about)\s+/i, "")
    .replace(/\s+(by|on)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function ensureUniquePath(baseDir: string, slug: string): { path: string; id: string } {
  let candidate = slug;
  let index = 2;
  while (existsSync(path.join(baseDir, `${candidate}.md`))) {
    candidate = `${slug}-${index}`;
    index += 1;
  }
  return {
    path: path.join(baseDir, `${candidate}.md`),
    id: `task/${candidate}`,
  };
}

function extractTaskBody(input: string): string | null {
  const patterns = [
    /^task\s*:\s*(.+)$/i,
    /^todo\s*:\s*(.+)$/i,
    /^add\s+(?:a\s+)?task\s+to\s+(.+)$/i,
    /^create\s+(?:a\s+)?task\s+to\s+(.+)$/i,
    /^add\s+to\s+my\s+tasks\s*:\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(input.trim());
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function maybeExtractDue(body: string): { action: string; due?: string } {
  const parsed = parse(body, new Date(), { forwardDate: true })[0];
  if (!parsed) {
    return { action: cleanActionText(body) };
  }

  const hasDateCue = /\b(by|on|tomorrow|today|tonight|next|this|friday|saturday|sunday|monday|tuesday|wednesday|thursday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(body);
  if (!hasDateCue) {
    return { action: cleanActionText(body) };
  }

  const actionRaw = `${body.slice(0, parsed.index)} ${body.slice(parsed.index + parsed.text.length)}`;
  const action = cleanActionText(actionRaw);
  if (!action) {
    return { action: cleanActionText(body) };
  }

  return {
    action,
    due: formatDate(parsed.start.date()),
  };
}

export class PersonalTaskService {
  createFromNaturalLanguage(input: string): string | null {
    const body = extractTaskBody(input);
    if (!body) return null;

    const { action, due } = maybeExtractDue(body);
    if (!action) {
      return "I couldn't figure out the task action. Try something like 'task: renew passport' or 'add a task to book dentist by friday'.";
    }

    const wikiRoot = getPersonalWikiRoot();
    const tasksDir = path.join(wikiRoot, "pages", "planner", "tasks");
    mkdirSync(tasksDir, { recursive: true });

    const slug = slugify(action);
    const { path: filePath, id } = ensureUniquePath(tasksDir, slug);
    const title = titleCase(action);
    const today = todayStamp();

    const content = [
      "---",
      `id: ${id}`,
      "schema_version: 1",
      "type: task",
      "object_type: task",
      `title: ${title}`,
      "aliases: []",
      "tags: [task]",
      "domain: personal",
      "areas: []",
      "hosts: []",
      "status: open",
      "validation_level: seed",
      "priority: medium",
      `due: ${due ?? ""}`,
      "scheduled:",
      "schedule:",
      `created: ${today}`,
      `updated: ${today}`,
      "projects: []",
      "people: []",
      "systems: []",
      "sources: []",
      "related: []",
      "depends_on: []",
      "blocked_by: []",
      "completed:",
      "source_ids: []",
      `summary: ${due ? `Task to ${action} by ${due}.` : `Task to ${action}.`}`,
      "---",
      "",
      `# ${title}`,
      "",
      "## Outcome",
      "",
      `Complete: ${action}.`,
      "",
      "## Next action",
      "",
      `- ${action}`,
      "",
      "## Notes",
      "",
      "Captured from Pi WhatsApp personal gateway.",
      "",
      "## Related",
      "",
    ].join("\n");

    writeFileSync(filePath, content, "utf-8");
    rebuildPersonalRegistry(wikiRoot);

    return due
      ? `Okay — I created a task due ${due}: ${action}.`
      : `Okay — I created a task: ${action}.`;
  }
}
