import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rebuildAllMeta } from "../extension/actions-meta.ts";
import { handleEnsurePage } from "../extension/actions-pages.ts";

describe("actions-pages v2 scaffolding", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "llm-wiki-pages-v2-"));
    mkdirSync(path.join(wikiRoot, "pages"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("creates canonical notes with object_type, id, review metadata, and non-empty summary", () => {
    rebuildAllMeta(wikiRoot);
    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Flake Patterns",
      domain: "technical",
      folder: "resources/technical",
      areas: ["nixos"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.details?.resolved && !result.value.details.conflict) {
      const content = readFileSync(path.join(wikiRoot, result.value.details.path), "utf8");
      expect(content).toContain("id: concept/flake-patterns");
      expect(content).toContain("object_type: concept");
      expect(content).toContain("schema_version: 1");
      expect(content).toContain("validation_level: seed");
      expect(content).toContain("review_cycle_days: 180");
      expect(content).toContain("summary: Working note for Flake Patterns.");
    }
  });

  it("creates task, event, and reminder pages in planner folders with typed defaults", () => {
    rebuildAllMeta(wikiRoot);

    const task = handleEnsurePage(wikiRoot, { type: "task", title: "Pay rent", domain: "personal" });
    const event = handleEnsurePage(wikiRoot, { type: "event", title: "Weekly Sync", domain: "technical" });
    const reminder = handleEnsurePage(wikiRoot, { type: "reminder", title: "Review backups", domain: "technical" });

    expect(task.isOk()).toBe(true);
    expect(event.isOk()).toBe(true);
    expect(reminder.isOk()).toBe(true);

    if (task.isOk() && task.value.details?.resolved && !task.value.details.conflict) {
      const content = readFileSync(path.join(wikiRoot, task.value.details.path), "utf8");
      expect(task.value.details.path).toBe("pages/planner/tasks/pay-rent.md");
      expect(content).toContain("object_type: task");
      expect(content).toContain("status: open");
      expect(content).toContain("priority: medium");
      expect(content).toContain("depends_on: []");
    }

    if (event.isOk() && event.value.details?.resolved && !event.value.details.conflict) {
      const content = readFileSync(path.join(wikiRoot, event.value.details.path), "utf8");
      expect(event.value.details.path).toBe("pages/planner/calendar/weekly-sync.md");
      expect(content).toContain("object_type: event");
      expect(content).toContain("status: scheduled");
      expect(content).toContain("location:");
      expect(content).toContain("attendees: []");
    }

    if (reminder.isOk() && reminder.value.details?.resolved && !reminder.value.details.conflict) {
      const content = readFileSync(path.join(wikiRoot, reminder.value.details.path), "utf8");
      expect(reminder.value.details.path).toBe("pages/planner/reminders/review-backups.md");
      expect(content).toContain("object_type: reminder");
      expect(content).toContain("status: open");
      expect(content).toContain("remind_at:");
      expect(content).toContain("snooze_until:");
    }
  });

  it("rejects page creation outside the allowed domain scope", () => {
    process.env.PI_LLM_WIKI_ALLOWED_DOMAINS = "technical";
    rebuildAllMeta(wikiRoot);

    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Private Note",
      domain: "personal",
      folder: "resources/knowledge",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toContain('Domain "personal" is not accessible in this session');
      expect(result.error).toContain("Allowed domains: technical");
    }

    delete process.env.PI_LLM_WIKI_ALLOWED_DOMAINS;
  });
});
