import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "chrono-node";
import { getPersonalWikiRoot, rebuildPersonalRegistry } from "./wiki.js";

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "reminder";
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
    .replace(/^(to|about)\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function ensureUniquePath(baseDir: string, slug: string, datePart: string): { path: string; id: string } {
  const baseName = `${slug}-${datePart}`;
  let candidate = baseName;
  let index = 2;
  while (existsSync(path.join(baseDir, `${candidate}.md`))) {
    candidate = `${baseName}-${index}`;
    index += 1;
  }
  return {
    path: path.join(baseDir, `${candidate}.md`),
    id: `reminder/${candidate}`,
  };
}

export class PersonalReminderService {
  createFromNaturalLanguage(input: string): string | null {
    const normalized = input.trim();
    if (!/^remind me\b/i.test(normalized)) return null;
    if (/\bevery\b/i.test(normalized)) {
      return "I can't create recurring reminders from WhatsApp yet. For now, send a one-time reminder like 'remind me tomorrow at 9 to call mom'.";
    }

    const body = normalized.replace(/^remind me\s*/i, "").trim();
    const parsed = parse(body, new Date(), { forwardDate: true })[0];
    if (!parsed) {
      return "I couldn't find a clear reminder time. Try something like 'remind me tomorrow at 9 to call mom'.";
    }

    const remindAt = parsed.start.date();
    const actionRaw = `${body.slice(0, parsed.index)} ${body.slice(parsed.index + parsed.text.length)}`;
    const action = cleanActionText(actionRaw);
    if (!action) {
      return "I understood the time, but not what you want to be reminded about. Try 'remind me tomorrow at 9 to call mom'.";
    }

    const wikiRoot = getPersonalWikiRoot();
    const remindersDir = path.join(wikiRoot, "pages", "planner", "reminders");
    mkdirSync(remindersDir, { recursive: true });

    const datePart = formatDate(remindAt);
    const slug = slugify(action);
    const { path: filePath, id } = ensureUniquePath(remindersDir, slug, datePart);
    const title = `${titleCase(action)} - ${datePart}`;
    const created = todayStamp();
    const remindAtText = formatDateTimeLocal(remindAt);

    const content = [
      "---",
      `id: ${id}`,
      "schema_version: 1",
      "type: reminder",
      "object_type: reminder",
      `title: ${title}`,
      "aliases: []",
      "tags: [reminder]",
      "domain: personal",
      "areas: []",
      "hosts: []",
      "status: open",
      "validation_level: seed",
      `remind_at: ${remindAtText}`,
      "snooze_until:",
      `for: ${action}`,
      `created: ${created}`,
      `updated: ${created}`,
      "projects: []",
      "people: []",
      "related: []",
      "completed:",
      "source_ids: []",
      `summary: Reminder to ${action} at ${remindAtText}.`,
      "---",
      "",
      `# ${title}`,
      "",
      "## Context",
      "",
      "Captured from Pi WhatsApp personal gateway.",
      "",
      "## What to do",
      "",
      `- ${action}`,
      "",
      "## Related",
      "",
    ].join("\n");

    writeFileSync(filePath, content, "utf-8");
    rebuildPersonalRegistry(wikiRoot);

    return `Okay — I created a reminder for ${remindAtText}: ${action}.`;
  }
}
