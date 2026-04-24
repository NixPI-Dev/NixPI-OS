import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import extension from "../extension/index.ts";
import { captureText } from "../extension/actions-capture.ts";
import { handleWikiLint } from "../extension/actions-lint.ts";
import { buildBacklinks, handleWikiStatus, loadRegistry, readEvents, rebuildAllMeta } from "../extension/actions-meta.ts";
import { handleEnsurePage } from "../extension/actions-pages.ts";
import { handleWikiSearch } from "../extension/actions-search.ts";
import { createMockExtensionAPI } from "./helpers/mock-extension-api.ts";

function initWikiRoot(root: string) {
  for (const dir of [
    "raw",
    "meta",
    "pages/sources",
    "pages/resources/technical",
    "pages/resources/knowledge",
    "pages/planner/tasks",
    "pages/planner/calendar",
    "pages/planner/reminders",
    "pages/journal/daily",
    "templates/markdown",
  ]) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }
}

describe("llm-wiki integration", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "llm-wiki-integration-"));
    initWikiRoot(wikiRoot);
    process.env.PI_LLM_WIKI_HOST = "yoga-nixos";
    delete process.env.PI_LLM_WIKI_ALLOWED_DOMAINS;
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
    delete process.env.PI_LLM_WIKI_HOST;
    delete process.env.PI_LLM_WIKI_ALLOWED_DOMAINS;
  });

  it("supports a real capture -> rebuild -> search -> ensure-page flow", () => {
    const captured = captureText(
      wikiRoot,
      "Flake module layering notes\n\nShared module patterns for NixOS and Home Manager.",
      {
        title: "Flake Module Layering Notes",
        domain: "technical",
        areas: ["nixos", "pi"],
        hosts: ["yoga-nixos"],
        tags: ["capture"],
      },
      new Date("2026-04-21T10:00:00Z"),
    );

    expect(captured.isOk()).toBe(true);
    if (captured.isErr()) return;

    const sourcePath = path.join(wikiRoot, captured.value.details.sourcePagePath);
    expect(existsSync(sourcePath)).toBe(true);
    expect(readFileSync(sourcePath, "utf8")).toContain("source_id: SRC-2026-04-21-001");

    const { registry, backlinks } = rebuildAllMeta(wikiRoot);
    expect(registry.pages.map((page) => page.path)).toContain("pages/sources/SRC-2026-04-21-001.md");
    expect(backlinks.byPath["pages/sources/SRC-2026-04-21-001.md"]?.inbound).toEqual([]);

    const sourceSearch = handleWikiSearch(loadRegistry(wikiRoot), "flake module layering", {
      type: "source",
      domain: "technical",
      areas: ["nixos"],
      host: "yoga-nixos",
    });
    expect(sourceSearch.isOk()).toBe(true);
    if (sourceSearch.isOk()) {
      expect(sourceSearch.value.details.matches[0]?.title).toBe("Flake Module Layering Notes");
    }

    const ensured = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Flake Layering",
      domain: "technical",
      folder: "resources/technical",
      areas: ["nixos", "pi"],
      hosts: ["yoga-nixos"],
      summary: "Layering rules for flake modules.",
    });
    expect(ensured.isOk()).toBe(true);
    if (ensured.isErr() || !ensured.value.details.resolved || ensured.value.details.conflict) return;

    const conceptPath = path.join(wikiRoot, ensured.value.details.path);
    const sourcePageRel = captured.value.details.sourcePagePath.replace(/^pages\//, "").replace(/\.md$/, "");
    const conceptBody = readFileSync(conceptPath, "utf8").replace(
      "## Evidence\n\n",
      `## Evidence\n\n- [[${sourcePageRel}|Primary source]]\n\n`,
    );
    writeFileSync(conceptPath, conceptBody, "utf8");

    const rebuilt = rebuildAllMeta(wikiRoot);
    const rebuiltBacklinks = buildBacklinks(rebuilt.registry);

    expect(rebuilt.registry.pages.map((page) => page.path)).toContain("pages/resources/technical/flake-layering.md");
    expect(rebuiltBacklinks.byPath["pages/sources/SRC-2026-04-21-001.md"]?.inbound).toEqual([
      "pages/resources/technical/flake-layering.md",
    ]);

    const conceptSearch = handleWikiSearch(rebuilt.registry, "flake layering", {
      domain: "technical",
      folder: "resources/technical",
      host: "yoga-nixos",
    });
    expect(conceptSearch.isOk()).toBe(true);
    if (conceptSearch.isOk()) {
      expect(conceptSearch.value.details.matches[0]?.title).toBe("Flake Layering");
      expect(conceptSearch.value.text).toContain("[domain: technical]");
      expect(conceptSearch.value.text).toContain("[areas: nixos, pi]");
      expect(conceptSearch.value.text).toContain("[hosts: yoga-nixos]");
    }

    expect(readEvents(wikiRoot).map((event) => event.kind)).toEqual(["capture", "page-create"]);
  });

  it("wires real extension hooks against a temporary wiki root", async () => {
    process.env.PI_LLM_WIKI_DIR = wikiRoot;
    const api = createMockExtensionAPI();
    extension(api as never);

    const captureTool = api._registeredTools.find((tool) => tool.name === "wiki_capture");
    const ensureTool = api._registeredTools.find((tool) => tool.name === "wiki_ensure_page");
    expect(typeof captureTool?.execute).toBe("function");
    expect(typeof ensureTool?.execute).toBe("function");

    await (captureTool?.execute as (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>)("capture", {
      input_type: "text",
      value: "Extension owned content for rebuild checks.",
      title: "Extension Capture",
      domain: "technical",
      areas: ["pi"],
      hosts: ["yoga-nixos"],
    });

    await (ensureTool?.execute as (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>)("ensure", {
      type: "concept",
      title: "Extension Managed Note",
      domain: "technical",
      folder: "resources/technical",
      areas: ["pi"],
      hosts: ["yoga-nixos"],
      summary: "Created through the extension tool.",
    });

    const pagePath = path.join(wikiRoot, "pages", "resources", "technical", "extension-managed-note.md");
    expect(existsSync(pagePath)).toBe(true);
    expect(readFileSync(path.join(wikiRoot, "meta", "registry.json"), "utf8")).toContain("Extension Managed Note");

    const blocked = await api.fireEvent("tool_call", {
      toolName: "write",
      input: { path: path.join(wikiRoot, "raw", "SRC-2026-04-21-999", "manifest.json") },
    });
    expect(blocked).toEqual({ block: true, reason: "Wiki protects raw/ and meta/. Use wiki tools instead." });

    const allowed = await api.fireEvent("tool_call", {
      toolName: "edit",
      input: { path: pagePath },
    });
    expect(allowed).toBeUndefined();

    const activatedPage = readFileSync(pagePath, "utf8")
      .replace("status: draft", "status: active")
      .concat(`\nExtra integration line.\n\n${"word ".repeat(40)}`);
    writeFileSync(pagePath, activatedPage, "utf8");
    await api.fireEvent("agent_end");

    const registryAfterEdit = loadRegistry(wikiRoot);
    expect(registryAfterEdit.pages.map((page) => page.title)).toContain("Extension Managed Note");

    const promptResult = (await api.fireEvent("before_agent_start", { systemPrompt: "BASE" })) as { systemPrompt: string };
    expect(promptResult.systemPrompt).toContain("[LLM WIKI CONTEXT]");
    expect(promptResult.systemPrompt).toContain("[WIKI PLANNER DIGEST");
    expect(promptResult.systemPrompt).toContain("Extension Managed Note");

    delete process.env.PI_LLM_WIKI_DIR;
  });

  it("runs lint and metadata rebuilds against a real seeded wiki", () => {
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "system-landscape.md"),
      `---
type: concept
title: System Landscape
domain: technical
aliases: []
tags: [nixos]
hosts: []
areas: [infrastructure]
status: active
updated: 2026-04-21
source_ids: [SRC-2026-04-21-001]
summary: Shared map of systems.
id: concept/system-landscape
object_type: concept
schema_version: 1
validation_level: trusted
---
# System Landscape

See [Broken relative](../missing.md) and [[resources/technical/platform-map]].
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "platform-map.md"),
      `---
type: concept
title: Platform Map
domain: technical
aliases: []
tags: []
hosts: []
areas: [infrastructure]
status: active
updated: 2026-04-21
source_ids: []
summary: 
id: concept/system-landscape
object_type: concept
schema_version: 2
validation_level: working
related: [concept/ghost]
---
# Platform Map

Tiny note.
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "sources", "SRC-2026-04-21-001.md"),
      `---
type: source
source_id: SRC-2026-04-21-001
title: Captured Source
status: captured
captured_at: 2026-04-21T10:00:00Z
origin_type: text
origin_value: (inline)
aliases: []
tags: []
hosts: []
areas: []
source_ids: [SRC-2026-04-21-001]
summary: Captured source packet
---
# Captured Source
`,
      "utf8",
    );

    const { registry, backlinks } = rebuildAllMeta(wikiRoot);
    expect(existsSync(path.join(wikiRoot, "meta", "registry.json"))).toBe(true);
    expect(existsSync(path.join(wikiRoot, "meta", "backlinks.json"))).toBe(true);
    expect(existsSync(path.join(wikiRoot, "meta", "index.md"))).toBe(true);
    expect(existsSync(path.join(wikiRoot, "meta", "log.md"))).toBe(true);
    expect(registry.pages).toHaveLength(3);
    expect(backlinks.byPath["pages/resources/technical/system-landscape.md"]?.outbound).toEqual([
      "pages/resources/technical/platform-map.md",
    ]);

    const lint = handleWikiLint(wikiRoot, "all");
    expect(lint.isOk()).toBe(true);
    if (lint.isErr()) return;

    const counts = lint.value.details.counts;
    expect(counts.brokenLinks).toBeGreaterThanOrEqual(1);
    expect(counts.coverage).toBeGreaterThanOrEqual(1);
    expect(counts.emptySummary).toBeGreaterThanOrEqual(1);
    expect(counts.duplicateIds).toBeGreaterThanOrEqual(1);
    expect(counts.unresolvedIds).toBeGreaterThanOrEqual(1);
    expect(counts.thinContent).toBeGreaterThanOrEqual(1);
    expect(counts.frontmatter).toBeGreaterThanOrEqual(1);

    const issues = lint.value.details.issues;
    const messages = issues.map((issue) => issue.message);
    expect(messages).toContain("Broken markdown link: (../missing.md)");
    expect(messages).toContain('Duplicate id "concept/system-landscape" also used by pages/resources/technical/platform-map.md');
    expect(messages).toContain("Unresolved relation in related: concept/ghost");
    expect(messages).toContain("Unsupported schema_version: 2");
    expect(issues.some((issue) => issue.kind === "empty-summary" || issue.message === "Field summary must be a non-empty string.")).toBe(true);

    const report = readFileSync(path.join(wikiRoot, "meta", "lint-report.md"), "utf8");
    expect(report).toContain("Broken markdown link: (../missing.md)");
    expect(report).toContain("Unsupported schema_version: 2");

    const status = handleWikiStatus(wikiRoot);
    expect(status.isOk()).toBe(true);
    if (status.isOk()) {
      expect(status.value.details).toMatchObject({
        initialized: true,
        total: 3,
        source: 1,
        canonical: 2,
      });
    }
  });
});
