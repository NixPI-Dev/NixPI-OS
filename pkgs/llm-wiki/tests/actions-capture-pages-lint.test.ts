import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureFile, captureText } from "../extension/actions-capture.ts";
import { handleWikiLint } from "../extension/actions-lint.ts";
import { readEvents, rebuildAllMeta } from "../extension/actions-meta.ts";
import { handleEnsurePage } from "../extension/actions-pages.ts";

describe("capture, pages, and lint", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "llm-wiki-actions-"));
    mkdirSync(path.join(wikiRoot, "raw"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "sources"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("captureText creates deterministic packets, manifests, and source pages", () => {
    mkdirSync(path.join(wikiRoot, "raw", "SRC-2026-04-19-001"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "raw", "misc-dir"), { recursive: true });
    const fixedNow = new Date("2026-04-19T12:00:00Z");
    const text = `\n\n${"A".repeat(90)}\nCaptured body`;

    const result = captureText(
      wikiRoot,
      text,
      {
        tags: ["capture"],
        hosts: [" Yoga-Nixos ", "yoga-nixos"],
        domain: " Technical ",
        areas: [" Infrastructure ", "ai", "ai"],
      },
      fixedNow,
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.sourceId).toBe("SRC-2026-04-19-002");
      const packetDir = path.join(wikiRoot, result.value.details?.packetDir ?? "");
      const pagePath = path.join(wikiRoot, result.value.details?.sourcePagePath ?? "");
      const manifest = JSON.parse(readFileSync(path.join(packetDir, "manifest.json"), "utf8"));
      expect(manifest).toMatchObject({
        sourceId: "SRC-2026-04-19-002",
        title: "A".repeat(80),
        kind: "note",
        capturedAt: "2026-04-19T12:00:00.000Z",
        status: "captured",
        origin: { type: "text", value: "(inline)" },
        hash: `sha256:${createHash("sha256").update(text).digest("hex")}`,
      });
      expect(readFileSync(path.join(packetDir, "extracted.md"), "utf8")).toBe(text);
      expect(readFileSync(path.join(packetDir, "original", "source.txt"), "utf8")).toBe(text);
      expect(existsSync(pagePath)).toBe(true);
      const page = readFileSync(pagePath, "utf8");
      expect(page).toContain(`# ${"A".repeat(80)}`);
      expect(page).toContain("origin_type: text");
      expect(page).toContain("origin_value: (inline)");
      expect(page).toContain("domain: technical");
      expect(page).toContain("- infrastructure");
      expect(page).toContain("- ai");
      expect(page).toContain("- yoga-nixos");
      expect(readEvents(wikiRoot)).toMatchObject([
        {
          kind: "capture",
          sourceIds: ["SRC-2026-04-19-002"],
          pagePaths: ["pages/sources/SRC-2026-04-19-002.md"],
        },
      ]);
    }
  });

  it("captureText falls back to Untitled Source when raw is missing and text is blank", () => {
    rmSync(path.join(wikiRoot, "raw"), { recursive: true, force: true });
    const result = captureText(wikiRoot, "\n  \n", undefined, new Date("2026-04-19T13:00:00Z"));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.sourceId).toBe("SRC-2026-04-19-001");
      expect(result.value.details?.title).toBe("Untitled Source");
      const page = readFileSync(path.join(wikiRoot, result.value.details?.sourcePagePath ?? ""), "utf8");
      expect(page).toContain("title: Untitled Source");
    }
  });

  it("captureFile copies files, supports extensionless files, and reports precise errors", () => {
    const sourceFile = path.join(wikiRoot, "input.txt");
    writeFileSync(sourceFile, "hello", "utf8");

    const okResult = captureFile(wikiRoot, sourceFile, { domain: "personal", areas: ["journal"] }, new Date("2026-04-19T14:00:00Z"));
    expect(okResult.isOk()).toBe(true);
    if (okResult.isOk()) {
      expect(existsSync(path.join(wikiRoot, okResult.value.details?.packetDir ?? "", "original", "source.txt"))).toBe(true);
    }

    const extensionlessFile = path.join(wikiRoot, "README");
    writeFileSync(extensionlessFile, "extensionless", "utf8");
    const extensionless = captureFile(wikiRoot, extensionlessFile, undefined, new Date("2026-04-19T15:00:00Z"));
    expect(extensionless.isOk()).toBe(true);
    if (extensionless.isOk()) {
      expect(extensionless.value.details?.title).toBe("README");
      expect(existsSync(path.join(wikiRoot, extensionless.value.details?.packetDir ?? "", "original", "source.bin"))).toBe(true);
    }

    const missing = captureFile(wikiRoot, path.join(wikiRoot, "missing.txt"));
    expect(missing.isErr()).toBe(true);
    if (missing.isErr()) {
      expect(missing.error).toContain("File not found:");
    }

    const pdfFile = path.join(wikiRoot, "input.pdf");
    writeFileSync(pdfFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));
    const pdf = captureFile(wikiRoot, pdfFile);
    expect(pdf.isErr()).toBe(true);
    if (pdf.isErr()) {
      expect(pdf.error).toBe("Unsupported file type for wiki capture: .pdf. Capture extracted text instead.");
    }

    const binaryFile = path.join(wikiRoot, "input.bin");
    writeFileSync(binaryFile, Buffer.from([0xff, 0xfe, 0x00]));
    const binary = captureFile(wikiRoot, binaryFile);
    expect(binary.isErr()).toBe(true);
    if (binary.isErr()) {
      expect(binary.error).toBe("Unsupported file type for wiki capture: .bin. Only UTF-8 text files are supported.");
    }
  });

  it("handleEnsurePage creates notes in requested folder with metadata", () => {
    rebuildAllMeta(wikiRoot);
    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Flake Patterns",
      domain: "technical",
      areas: ["nixos"],
      folder: "resources/technical",
      hosts: ["yoga-nixos"],
      summary: "Patterns for flakes",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.details?.resolved && !result.value.details.conflict) {
      expect(result.value.details.path).toBe("pages/resources/technical/flake-patterns.md");
      const content = readFileSync(path.join(wikiRoot, result.value.details.path), "utf8");
      expect(content).toContain("domain: technical");
      expect(content).toContain("- nixos");
      expect(content).toContain("- yoga-nixos");
      expect(content).toContain("summary: Patterns for flakes");
    }
  });

  it("handleEnsurePage creates journal entries under pages/journal/daily by default", () => {
    rebuildAllMeta(wikiRoot);
    const result = handleEnsurePage(wikiRoot, {
      type: "journal",
      title: "2026-04-19 Daily Journal",
      domain: "personal",
      areas: ["journal"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.details?.resolved && !result.value.details.conflict) {
      expect(result.value.details.path).toBe("pages/journal/daily/2026-04-19-daily-journal.md");
      const content = readFileSync(path.join(wikiRoot, result.value.details.path), "utf8");
      expect(content).toContain("type: journal");
      expect(content).toContain("status: active");
      expect(content).toContain("## Focus");
      expect(content).toContain("## Follow-ups");
    }
  });

  it("handleEnsurePage resolves exact title and alias matches within the same scope", () => {
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "flake-patterns.md"),
      `---
type: concept
title: Flake Patterns
aliases: [nix flakes]
tags: [nixos]
hosts: []
domain: technical
areas: [nixos]
status: active
updated: 2026-04-19
source_ids: []
summary: Existing page
---
# Flake Patterns
`,
      "utf8",
    );
    rebuildAllMeta(wikiRoot);

    const exact = handleEnsurePage(wikiRoot, { type: "concept", title: "Flake Patterns", folder: "resources/technical" });
    const alias = handleEnsurePage(wikiRoot, { type: "concept", title: "nix flakes", folder: "resources/technical" });

    expect(exact.isOk()).toBe(true);
    expect(alias.isOk()).toBe(true);
    if (exact.isOk() && alias.isOk()) {
      expect(exact.value.details?.created).toBe(false);
      expect(alias.value.details?.created).toBe(false);
    }
  });

  it("handleEnsurePage reports conflicts when multiple pages match within one folder", () => {
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "shared-name.md"),
      `---
type: concept
title: Shared Name
aliases: []
tags: []
hosts: []
domain: technical
areas: [infra]
status: active
updated: 2026-04-19
source_ids: []
summary: Existing page
---
# Shared Name
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "other-page.md"),
      `---
type: concept
title: Other Page
aliases: [Shared Name]
tags: []
hosts: []
domain: technical
areas: [infra]
status: active
updated: 2026-04-19
source_ids: []
summary: Existing page
---
# Other Page
`,
      "utf8",
    );
    rebuildAllMeta(wikiRoot);

    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Shared Name",
      domain: "technical",
      folder: "resources/technical",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.conflict).toBe(true);
      expect(result.value.details?.candidates).toEqual([
        { path: "pages/resources/technical/other-page.md", title: "Other Page" },
        { path: "pages/resources/technical/shared-name.md", title: "Shared Name" },
      ]);
    }
  });

  it("handleEnsurePage dedupes slugs when the title is new but the slug already exists", () => {
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "flake-patterns.md"),
      `---
type: concept
title: Existing Page
aliases: []
tags: []
hosts: []
domain: technical
areas: [infra]
status: active
updated: 2026-04-19
source_ids: []
summary: Existing page
---
# Existing Page
`,
      "utf8",
    );
    rebuildAllMeta(wikiRoot);

    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Flake Patterns",
      domain: "technical",
      folder: "resources/technical",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.details?.resolved && !result.value.details.conflict) {
      expect(result.value.details.path).toBe("pages/resources/technical/flake-patterns-2.md");
    }
  });

  it("handleEnsurePage ignores type, domain, and folder mismatches when resolving existing pages", () => {
    mkdirSync(path.join(wikiRoot, "pages", "resources", "personal"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "areas", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "personal", "shared.md"),
      `---
type: concept
title: Shared
aliases: []
tags: []
hosts: []
domain: personal
areas: [identity]
status: active
updated: 2026-04-19
source_ids: []
summary: Personal page
---
# Shared
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "areas", "technical", "shared.md"),
      `---
type: concept
title: Shared
aliases: []
tags: []
hosts: []
domain: technical
areas: [infra]
status: active
updated: 2026-04-19
source_ids: []
summary: Area page
---
# Shared
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "shared-journal.md"),
      `---
type: journal
title: Shared
aliases: []
tags: []
hosts: []
domain: technical
areas: [journal]
status: active
updated: 2026-04-19
summary: Journal page
---
# Shared
`,
      "utf8",
    );
    rebuildAllMeta(wikiRoot);

    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Shared",
      domain: "technical",
      folder: "resources/technical",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.details?.resolved && !result.value.details.conflict) {
      expect(result.value.details.created).toBe(true);
      expect(result.value.details.path).toBe("pages/resources/technical/shared.md");
    }
  });

  it("handleEnsurePage creates a page in the domain root when no folder is provided", () => {
    rebuildAllMeta(wikiRoot);
    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Personal Systems",
      domain: "personal",
      areas: ["life-ops"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.details?.resolved && !result.value.details.conflict) {
      expect(result.value.details.path).toBe("pages/personal/personal-systems.md");
    }
  });

  it("handleEnsurePage can create a global page without a domain", () => {
    rebuildAllMeta(wikiRoot);
    const result = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "General Note",
      hosts: [" Yoga-Nixos "],
      areas: [" General "],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.details?.resolved && !result.value.details.conflict) {
      expect(result.value.details.path).toBe("pages/general-note.md");
      const content = readFileSync(path.join(wikiRoot, result.value.details.path), "utf8");
      expect(content).not.toContain("domain:");
      expect(content).toContain("- yoga-nixos");
      expect(content).toContain("- general");
    }
  });

  it("handleWikiLint reports frontmatter, links, and ignores journal coverage requirements", () => {
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "journal", "daily"), { recursive: true });

    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "bad.md"),
      `---
type: concept
title: Bad Page
domain: technical
areas: [nixos]
hosts: []
status: active
updated: 2026-04-19
source_ids: []
summary: bad
---
# Bad Page

See [[missing-page]].
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "invalid-frontmatter.md"),
      `---
type: concept
title: ""
domain: 123
aliases: nope
tags: []
hosts: [yoga-nixos, 1]
areas: [nixos]
status: publishing
updated:
source_ids: []
summary:
---
# Invalid Frontmatter
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "journal", "daily", "2026-04-19.md"),
      `---
type: journal
title: 2026-04-19 Daily Journal
domain: personal
areas: [journal]
hosts: []
status: active
updated: 2026-04-19
summary: Daily note
---
# Daily Journal
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "all");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.brokenLinks).toBeGreaterThan(0);
      expect(result.value.details?.counts.coverage).toBe(2);
      expect(result.value.details?.counts.frontmatter).toBeGreaterThanOrEqual(5);
      const messages = result.value.details?.issues.filter((issue) => issue.kind === "frontmatter").map((issue) => issue.message) ?? [];
      expect(messages).toContain("Field title must be a non-empty string.");
      expect(messages).toContain("Invalid domain: 123");
      expect(messages).toContain("Field aliases must be an array of strings.");
      expect(messages).toContain("Field hosts must be an array of strings.");
      expect(messages.some(m => m.includes('Invalid status "publishing"'))).toBe(true);
      const report = readFileSync(path.join(wikiRoot, "meta", "lint-report.md"), "utf8");
      expect(report).toContain("broken-link");
      expect(report).not.toContain("pages/journal/daily/2026-04-19.md` - No source_ids listed.");
    }
  });

  it("handleWikiLint validates source-page specific frontmatter fields", () => {
    mkdirSync(path.join(wikiRoot, "pages", "sources"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "sources", "src-1.md"),
      `---
type: source
source_id:
title: Broken Source
status: active
captured_at:
origin_type: clipboard
origin_value:
aliases: []
tags: []
hosts: []
areas: []
source_ids: nope
integration_targets: nope
summary: Broken source page
---
# Broken Source
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "sources", "src-2.md"),
      `---
type: source
source_id: SRC-2026-04-19-002
title: Integrated Source
status: integrated
captured_at: 2026-04-19T00:00:00Z
origin_type: text
origin_value: (inline)
aliases: []
tags: []
hosts: []
areas: []
source_ids:
  - SRC-2026-04-19-002
integration_targets: []
summary: ''
---
# Integrated Source
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "frontmatter");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const messages = result.value.details?.issues.map((issue) => issue.message) ?? [];
      expect(messages).toContain("Field source_id must be a non-empty string.");
      expect(messages).toContain("Invalid source status: active");
      expect(messages).toContain("Field captured_at must be a non-empty string.");
      expect(messages).toContain("Invalid origin_type: clipboard");
      expect(messages).toContain("Field origin_value must be a non-empty string.");
      expect(messages).toContain("Field source_ids must be an array of strings.");
      expect(messages).toContain("Field integration_targets must be an array of strings.");
      expect(messages).toContain("Integrated sources require a non-empty summary.");
      expect(messages).toContain("Integrated sources require integration_targets.");
    }
  });

  it("handleWikiLint reports missing and invalid frontmatter schema fields", () => {
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "sources"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "missing-type.md"),
      `---
title: Missing Type
status: active
updated: 2026-04-19
source_ids: []
summary: Missing type field
---
# Missing Type
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "invalid-type.md"),
      `---
type: nonsense
title: Invalid Type
summary: Invalid page
---
# Invalid Type
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "missing-required.md"),
      `---
type: concept
title: Missing Required
status: active
source_ids: []
summary: [oops]
---
# Missing Required
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "sources", "missing-source-fields.md"),
      `---
type: source
source_id: SRC-2026-04-19-001
title: Missing Source Fields
status: captured
captured_at: 2026-04-19T00:00:00Z
origin_type: text
source_ids: []
summary: Source without origin value
---
# Missing Source Fields
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "frontmatter");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const messages = result.value.details?.issues.map((issue) => issue.message) ?? [];
      expect(messages).toContain("Missing: type");
      expect(messages).toContain("Invalid type: nonsense");
      expect(messages).toContain("Missing: updated");
      expect(messages).toContain("Field summary must be a string.");
      expect(messages).toContain("Missing: origin_value");
    }
  });

  it("handleWikiLint validates wikilink heading fragments", () => {
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "system-landscape.md"),
      `---
type: concept
title: System Landscape
domain: technical
aliases: []
tags: []
hosts: []
areas: [infrastructure]
status: active
updated: 2026-04-19
source_ids: [SRC-2026-04-19-001]
summary: Shared technical map
---
# System Landscape

## Next Step
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "consumer.md"),
      `---
type: concept
title: Consumer
domain: technical
aliases: []
tags: []
hosts: []
areas: [infrastructure]
status: active
updated: 2026-04-19
source_ids: [SRC-2026-04-19-001]
summary: Consumer note
---
# Consumer

See [[resources/technical/system-landscape#Next Step]].
See [[resources/technical/system-landscape#Missing Heading]].
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "links");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.details?.counts.brokenLinks).toBe(1);
      expect(result.value.details?.issues[0]?.message).toBe(
        "Broken heading link: [[resources/technical/system-landscape#Missing Heading]]",
      );
    }
  });

  it("handleWikiLint reports integration target provenance mismatches", () => {
    mkdirSync(path.join(wikiRoot, "pages", "sources"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "sources", "SRC-2026-04-19-001.md"),
      `---
type: source
source_id: SRC-2026-04-19-001
title: Integrated Source
status: integrated
captured_at: 2026-04-19T00:00:00Z
integrated_at: 2026-04-19T01:00:00Z
origin_type: text
origin_value: (inline)
aliases: []
tags: []
hosts: []
areas: []
source_ids:
  - SRC-2026-04-19-001
integration_targets:
  - pages/resources/technical/portable-cli-runtime.md
summary: Integrated source summary
---
# Integrated Source
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "portable-cli-runtime.md"),
      `---
type: concept
title: Portable CLI Runtime
domain: technical
aliases: []
tags: []
hosts: []
areas: [wiki]
status: active
updated: 2026-04-19
source_ids: []
summary: Target page
---
# Portable CLI Runtime
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "coverage");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const messages = result.value.details?.issues.map((issue) => issue.message) ?? [];
      expect(messages).toContain("integration target missing source_ids reference: pages/resources/technical/portable-cli-runtime.md");
    }
  });

  it("handleWikiLint reports duplicates, orphans, uncited sources, and staleness", () => {
    mkdirSync(path.join(wikiRoot, "pages", "resources", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "areas", "technical"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "sources"), { recursive: true });
    writeFileSync(
      path.join(wikiRoot, "pages", "resources", "technical", "same-title.md"),
      `---
type: concept
title: Same Title
domain: technical
aliases: []
tags: []
hosts: []
areas: [infra]
status: active
updated: 2026-04-19
source_ids: []
summary: First duplicate
---
# Same Title
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "areas", "technical", "same-title.md"),
      `---
type: concept
title: Same Title
domain: technical
aliases: []
tags: []
hosts: []
areas: [infra]
status: active
updated: 2026-04-19
source_ids: []
summary: Second duplicate
---
# Same Title
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "sources", "src-a.md"),
      `---
type: source
source_id: SRC-2026-04-19-001
title: Source A
status: captured
captured_at: 2026-04-19T00:00:00Z
origin_type: text
origin_value: clip
aliases: []
tags: []
hosts: []
areas: []
source_ids: []
summary: Source A
---
# Source A
`,
      "utf8",
    );
    writeFileSync(
      path.join(wikiRoot, "pages", "sources", "src-b.md"),
      `---
type: source
source_id: SRC-2026-04-19-002
title: Source B
status: integrated
captured_at: 2026-04-19T00:00:00Z
origin_type: text
origin_value: clip
aliases: []
tags: []
hosts: []
areas: []
source_ids: []
summary: Source B
---
# Source B

See [[sources/src-a]].
`,
      "utf8",
    );

    const result = handleWikiLint(wikiRoot, "all");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const issues = result.value.details?.issues ?? [];
      expect(issues.some((issue) => issue.kind === "duplicate")).toBe(true);
      expect(issues.some((issue) => issue.kind === "orphan")).toBe(true);
      expect(issues.some((issue) => issue.kind === "coverage" && issue.message === "Source not cited by any canonical page via source_ids.")).toBe(true);
      expect(issues.some((issue) => issue.kind === "staleness" && issue.path === "pages/sources/src-a.md")).toBe(true);
      expect(result.value.details?.counts.duplicates).toBeGreaterThan(0);
      expect(result.value.details?.counts.orphans).toBeGreaterThan(0);
      expect(result.value.details?.counts.staleness).toBe(1);
    }
  });

  it("capture operations create raw source directories", () => {
    captureText(wikiRoot, "another note");
    const rawEntries = readdirSync(path.join(wikiRoot, "raw"));
    expect(rawEntries.some((entry) => entry.startsWith("SRC-"))).toBe(true);
  });
});
