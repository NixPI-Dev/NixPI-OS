import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PersonalTaskService } from "../src/personal/tasks.js";
import { loadPersonalRegistry } from "../src/personal/wiki.js";

function withPersonalWikiRoot<T>(fn: (wikiRoot: string) => T): T {
  const previous = process.env.PI_LLM_WIKI_DIR_PERSONAL;
  const wikiRoot = mkdtempSync(path.join(os.tmpdir(), "pi-gateway-personal-wiki-"));
  process.env.PI_LLM_WIKI_DIR_PERSONAL = wikiRoot;
  try {
    return fn(wikiRoot);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_LLM_WIKI_DIR_PERSONAL;
    } else {
      process.env.PI_LLM_WIKI_DIR_PERSONAL = previous;
    }
    rmSync(wikiRoot, { recursive: true, force: true });
  }
}

test("personal task capture writes to the configured personal wiki and refreshes registry", () => {
  withPersonalWikiRoot((wikiRoot) => {
    const service = new PersonalTaskService();
    const reply = service.createFromNaturalLanguage("task: book dentist by friday");

    assert.match(reply ?? "", /created a task/i);

    const registry = loadPersonalRegistry(wikiRoot);
    const task = registry.pages.find((page) => page.type === "task" && page.title === "Book Dentist");

    assert.ok(task);
    assert.equal(task.domain, "personal");
    assert.equal(task.status, "open");
    assert.ok(task.path.startsWith("pages/planner/tasks/"));

    const taskFile = path.join(wikiRoot, task.path);
    assert.match(readFileSync(taskFile, "utf-8"), /Captured from Pi WhatsApp personal gateway/);
  });
});
