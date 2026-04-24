import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureText } from "../extension/actions-capture.ts";
import { handleIngestFinalize, handleIngestPrepare } from "../extension/actions-ingest.ts";
import { handleEnsurePage } from "../extension/actions-pages.ts";

function wireSourceForIntegration(wikiRoot: string, sourceId: string, targetPath: string) {
  const sourcePagePath = path.join(wikiRoot, "pages", "sources", `${sourceId}.md`);
  const targetAbsPath = path.join(wikiRoot, targetPath);

  const targetRaw = readFileSync(targetAbsPath, "utf8");
  writeFileSync(
    targetAbsPath,
    targetRaw.replace("source_ids: []", `source_ids:\n  - ${sourceId}`),
    "utf8",
  );

  const sourceRaw = readFileSync(sourcePagePath, "utf8");
  writeFileSync(
    sourcePagePath,
    sourceRaw
      .replace("integration_targets: []", `integration_targets:\n  - ${targetPath}`)
      .replace("summary: ''", "summary: Source One supports Portable CLI Runtime."),
    "utf8",
  );
}

describe("ingest actions", () => {
  let wikiRoot: string;

  beforeEach(() => {
    wikiRoot = mkdtempSync(path.join(os.tmpdir(), "nixpi-wiki-ingest-"));
    mkdirSync(path.join(wikiRoot, "raw"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "pages", "sources"), { recursive: true });
    mkdirSync(path.join(wikiRoot, "meta"), { recursive: true });
  });

  afterEach(() => {
    rmSync(wikiRoot, { recursive: true, force: true });
  });

  it("prepare lists captured packets and reports readiness blockers", () => {
    const capture = captureText(
      wikiRoot,
      "A source worth integrating",
      { title: "Source One", kind: "note", domain: "technical" },
      new Date("2026-04-23T10:00:00Z"),
    );

    expect(capture.isOk()).toBe(true);
    const prepared = handleIngestPrepare(wikiRoot, { status: "captured" });
    expect(prepared.isOk()).toBe(true);

    if (prepared.isOk()) {
      expect(prepared.value.details?.count).toBe(1);
      expect(prepared.value.details?.sources[0]).toMatchObject({
        sourceId: "SRC-2026-04-23-001",
        title: "Source One",
        kind: "note",
        status: "captured",
        packetDir: "raw/SRC-2026-04-23-001",
        manifestPath: "raw/SRC-2026-04-23-001/manifest.json",
        extractedPath: "raw/SRC-2026-04-23-001/extracted.md",
        sourcePagePath: "pages/sources/SRC-2026-04-23-001.md",
        sourcePageExists: true,
        ready: false,
        blockers: ["empty-summary", "no-integration-targets"],
      });
    }
  });

  it("finalize requires summary and integration targets before marking sources integrated", () => {
    const capture = captureText(
      wikiRoot,
      "A source worth integrating",
      { title: "Source One", kind: "note", domain: "technical" },
      new Date("2026-04-23T10:00:00Z"),
    );
    expect(capture.isOk()).toBe(true);

    const blocked = handleIngestFinalize(wikiRoot, { sourceIds: ["SRC-2026-04-23-001"] });
    expect(blocked.isOk()).toBe(true);
    if (blocked.isOk()) {
      expect(blocked.value.details?.finalized).toEqual([]);
      expect(blocked.value.details?.skipped[0]?.reason).toContain("blocked:empty-summary");
    }

    const target = handleEnsurePage(wikiRoot, {
      type: "concept",
      title: "Portable CLI Runtime",
      domain: "technical",
      summary: "Target page for integration",
    });
    expect(target.isOk()).toBe(true);
    if (target.isOk() && target.value.details?.resolved && !target.value.details.conflict) {
      wireSourceForIntegration(wikiRoot, "SRC-2026-04-23-001", target.value.details.path);
    }

    const finalize = handleIngestFinalize(wikiRoot, { sourceIds: ["SRC-2026-04-23-001"] });
    expect(finalize.isOk()).toBe(true);

    if (finalize.isOk()) {
      expect(finalize.value.details?.finalized).toEqual(["SRC-2026-04-23-001"]);
      expect(finalize.value.details?.skipped).toEqual([]);
    }

    const manifest = JSON.parse(readFileSync(path.join(wikiRoot, "raw", "SRC-2026-04-23-001", "manifest.json"), "utf8")) as {
      status: string;
      integratedAt?: string;
    };
    expect(manifest.status).toBe("integrated");
    expect(manifest.integratedAt).toBeTruthy();

    const page = readFileSync(path.join(wikiRoot, "pages", "sources", "SRC-2026-04-23-001.md"), "utf8");
    expect(page).toContain("status: integrated");
    expect(page).toContain("integration_targets:");

    const prepared = handleIngestPrepare(wikiRoot, { status: "captured" });
    expect(prepared.isOk()).toBe(true);
    if (prepared.isOk()) {
      expect(prepared.value.details?.count).toBe(0);
    }
  });
});
