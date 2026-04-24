import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleWikiLint } from "../extension/actions-lint.ts";

describe("actions-lint semantic heuristics", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "llm-wiki-semantic-"));
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "planner", "tasks"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("flags thin knowledge pages but ignores operational notes", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "thin-note.md"),
      `---
type: concept
id: concept/thin-note
object_type: concept
title: Thin Note
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: thin note summary
---
# Thin Note

Tiny note.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "planner", "tasks", "short-task.md"),
      `---
type: task
id: task/short-task
object_type: task
title: Short Task
domain: technical
areas: [planning]
status: open
updated: 2026-04-21
summary: short task summary
---
# Short Task
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "thin-content");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.thinContent).toBe(1);
      expect(result.value.details?.issues[0]?.path).toContain("thin-note.md");
      expect(result.value.details?.issues[0]?.message).toContain("Thin content");
    }
  });

  it("flags pages mentioned across notes without explicit links", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "special-topic.md"),
      `---
type: concept
id: concept/special-topic
object_type: concept
title: Special Topic
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: a well developed topic
---
# Special Topic

This page has enough body text to avoid thin-content warnings. It explains the special topic in enough words to clear the threshold comfortably.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "mention-one.md"),
      `---
type: concept
id: concept/mention-one
object_type: concept
title: Mention One
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-2]
summary: mention page one
---
# Mention One

We should revisit Special Topic during the next infra review.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "mention-two.md"),
      `---
type: concept
id: concept/mention-two
object_type: concept
title: Mention Two
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-3]
summary: mention page two
---
# Mention Two

Special Topic matters here as well, but this note forgot to link it.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "mention-linked.md"),
      `---
type: concept
id: concept/mention-linked
object_type: concept
title: Mention Linked
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-4]
summary: linked mention page
---
# Mention Linked

[Special Topic](./special-topic.md) is already linked correctly here.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "crossref-gaps");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.crossrefGaps).toBe(1);
      expect(result.value.details?.issues[0]?.path).toContain("special-topic.md");
      expect(result.value.details?.issues[0]?.message).toContain("Referenced in 2 page(s) without explicit links");
    }
  });
});
