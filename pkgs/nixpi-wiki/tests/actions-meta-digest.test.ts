import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWikiDigest, rebuildAllMeta } from "../extension/actions-meta.ts";

describe("actions-meta planner digest", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "nixpi-wiki-digest-"));
    mkdirSync(path.join(wikiRoot, "pages", "planner", "tasks"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "planner", "calendar"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "planner", "reminders"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "journal", "daily"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(wikiRoot, { recursive: true, force: true });
    delete process.env.PI_LLM_WIKI_HOST;
  });

  it("surfaces overdue tasks, due-soon work, upcoming events, reminders, and today's note", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T09:00:00Z"));
    process.env.PI_LLM_WIKI_HOST = "vps-nixos";

    writeFileSync(
      path.join(wikiRoot, "pages", "journal", "daily", "2026-04-21.md"),
      `---
type: journal
title: 2026-04-21
domain: technical
areas: [planning]
status: active
updated: 2026-04-21
summary: Daily note
---
# 2026-04-21
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "planner", "tasks", "overdue.md"),
      `---
type: task
object_type: task
title: Overdue Task
domain: technical
areas: [planning]
status: open
updated: 2026-04-20
due: 2026-04-20
summary: overdue
---
# Overdue Task
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "planner", "tasks", "today.md"),
      `---
type: task
object_type: task
title: Today Task
domain: technical
areas: [planning]
status: open
updated: 2026-04-21
due: 2026-04-21
summary: today
---
# Today Task
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "planner", "tasks", "done.md"),
      `---
type: task
object_type: task
title: Done Task
domain: technical
areas: [planning]
status: done
updated: 2026-04-21
due: 2026-04-21
summary: done
---
# Done Task
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "planner", "calendar", "sync.md"),
      `---
type: event
object_type: event
title: Weekly Sync
domain: technical
areas: [planning]
status: scheduled
updated: 2026-04-21
start: 2026-04-23
summary: event
---
# Weekly Sync
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "planner", "reminders", "review.md"),
      `---
type: reminder
object_type: reminder
title: Review Notes
domain: technical
areas: [planning]
status: open
updated: 2026-04-21
remind_at: 2026-04-21T08:00:00Z
summary: reminder
---
# Review Notes
`,
      "utf8",
    );

    rebuildAllMeta(wikiRoot);
    const digest = buildWikiDigest(wikiRoot);

    expect(digest).toContain("TODAY NOTE: pages/journal/daily/2026-04-21.md");
    expect(digest).toContain("OVERDUE (2026-04-20): Overdue Task");
    expect(digest).toContain("DUE TODAY: Today Task");
    expect(digest).toContain("EVENT 2026-04-23: Weekly Sync");
    expect(digest).toContain("REMINDER: Review Notes");
    expect(digest).not.toContain("Done Task");
  });
});
