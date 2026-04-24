import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleWikiLint } from "../extension/actions-lint.ts";

describe("actions-lint contradiction review and qmd-backed concept discovery", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "llm-wiki-qmd-"));
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
    delete process.env.PI_LLM_WIKI_QMD_BIN;
    delete process.env.PI_LLM_WIKI_QMD_COLLECTION;
  });

  afterEach(() => {
    delete process.env.PI_LLM_WIKI_QMD_BIN;
    delete process.env.PI_LLM_WIKI_QMD_COLLECTION;
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("flags contradiction-review candidates when overlapping evidence diverges", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "alpha.md"),
      `---
type: concept
id: concept/alpha
object_type: concept
title: Authentication Strategy
domain: technical
areas: [security]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: Session tokens remain the preferred default for this system.
---
# Authentication Strategy

This page explains the current recommendation in detail with enough body text to avoid thin-content noise for this test.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "beta.md"),
      `---
type: analysis
id: analysis/beta
object_type: analysis
title: Auth Session Review
domain: technical
areas: [security]
status: contested
updated: 2026-04-21
source_ids: [SRC-1]
summary: Session tokens should be phased out in favor of short-lived API keys.
---
# Auth Session Review

This page deliberately disagrees while citing the same source context, so it should be surfaced for manual review.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "contradiction-review");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.contradictionReview).toBe(1);
      expect(result.value.details?.issues[0]?.message).toContain("overlapping context but divergent summaries/status");
      expect(result.value.details?.issues[0]?.message).toContain("beta.md");
    }
  });

  it("surfaces missing concept candidates when qmd is configured", () => {
    const fakeQmd = path.join(wikiRoot, "fake-qmd.sh");
    writeFileSync(
      fakeQmd,
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "search" ]; then
  printf '%s\n' 'pages/resources/technical/page-one.md' 'pages/resources/technical/page-two.md'
  exit 0
fi
exit 1
`,
      "utf8",
    );
    chmodSync(fakeQmd, 0o755);
    process.env.PI_LLM_WIKI_QMD_BIN = fakeQmd;
    process.env.PI_LLM_WIKI_QMD_COLLECTION = "wiki";

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-one.md"),
      `---
type: concept
id: concept/page-one
object_type: concept
title: Page One
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: First page
---
# Page One

GPU Scheduler should be tuned more carefully on this host.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-two.md"),
      `---
type: concept
id: concept/page-two
object_type: concept
title: Page Two
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-2]
summary: Second page
---
# Page Two

We also need a better GPU Scheduler for batch jobs.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "missing-concepts");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.missingConcepts).toBe(1);
      expect(result.value.details?.issues[0]?.message).toContain('Missing concept candidate: "gpu scheduler"');
      expect(result.value.details?.issues[0]?.message).toMatch(/confirmed by qmd|local heuristic/);
    }
  });

  it("falls back to local heuristic when qmd is unavailable", () => {
    process.env.PI_LLM_WIKI_QMD_BIN = path.join(wikiRoot, "does-not-exist-qmd");

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-a.md"),
      `---
type: concept
id: concept/page-a
object_type: concept
title: Page A
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-1]
summary: A page
---
# Page A

Control Plane Latency keeps showing up in diagnostics.
`,
      "utf8",
    );

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "page-b.md"),
      `---
type: concept
id: concept/page-b
object_type: concept
title: Page B
domain: technical
areas: [infra]
status: active
updated: 2026-04-21
source_ids: [SRC-2]
summary: B page
---
# Page B

We need to monitor Control Plane Latency during upgrades too.
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "missing-concepts");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.missingConcepts).toBe(1);
      expect(result.value.details?.issues[0]?.message).toContain("local heuristic");
    }
  });
});
