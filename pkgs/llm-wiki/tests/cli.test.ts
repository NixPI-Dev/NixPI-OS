import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve("extension/cli.ts");

function runCli(args: string[], cwd = path.resolve(".")) {
  const result = spawnSync("node", ["--experimental-strip-types", cliPath, ...args], {
    cwd,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

describe("llm-wiki CLI", () => {
  it("reports status for an uninitialized wiki root", () => {
    const wikiRoot = mkdtempSync(path.join(os.tmpdir(), "llm-wiki-cli-empty-"));
    const result = runCli(["--json", "--wiki-root", wikiRoot, "status"], path.resolve("extension"));

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as { ok: boolean; details: { initialized: boolean; root: string } };
    expect(payload.ok).toBe(true);
    expect(payload.details.initialized).toBe(false);
    expect(payload.details.root).toBe(wikiRoot);
  });

  it("can create and then search a page", () => {
    const wikiRoot = mkdtempSync(path.join(os.tmpdir(), "llm-wiki-cli-"));

    const ensure = runCli([
      "--json",
      "--wiki-root",
      wikiRoot,
      "ensure-page",
      "--type",
      "concept",
      "--title",
      "Portable CLI Runtime",
      "--domain",
      "technical",
      "--areas",
      "wiki,tooling",
      "--summary",
      "Portable runtime extracted from the Pi extension.",
    ], path.resolve("extension"));

    expect(ensure.status).toBe(0);
    const ensured = JSON.parse(ensure.stdout) as { ok: boolean; details: { created: boolean; path: string } };
    expect(ensured.ok).toBe(true);
    expect(ensured.details.created).toBe(true);
    expect(ensured.details.path).toContain("pages/");

    const search = runCli([
      "--json",
      "--wiki-root",
      wikiRoot,
      "search",
      "Portable CLI Runtime",
      "--domain",
      "technical",
    ], path.resolve("extension"));

    expect(search.status).toBe(0);
    const payload = JSON.parse(search.stdout) as {
      ok: boolean;
      details: { matches: Array<{ title: string; domain?: string }> };
    };
    expect(payload.ok).toBe(true);
    expect(payload.details.matches[0]?.title).toBe("Portable CLI Runtime");
    expect(payload.details.matches[0]?.domain).toBe("technical");
  });

  it("can prepare and finalize captured sources", () => {
    const wikiRoot = mkdtempSync(path.join(os.tmpdir(), "llm-wiki-cli-ingest-"));

    const capture = runCli([
      "--json",
      "--wiki-root",
      wikiRoot,
      "capture",
      "text",
      "captured source body",
      "--title",
      "Captured Source",
      "--domain",
      "technical",
    ], path.resolve("extension"));

    expect(capture.status).toBe(0);

    const prepare = runCli([
      "--json",
      "--wiki-root",
      wikiRoot,
      "ingest",
      "prepare",
      "--status",
      "captured",
    ], path.resolve("extension"));

    expect(prepare.status).toBe(0);
    const prepared = JSON.parse(prepare.stdout) as {
      ok: boolean;
      details: { count: number; sources: Array<{ sourceId: string; status: string; ready: boolean; blockers: string[] }> };
    };
    expect(prepared.ok).toBe(true);
    expect(prepared.details.count).toBe(1);
    expect(prepared.details.sources[0]?.status).toBe("captured");
    expect(prepared.details.sources[0]?.ready).toBe(false);
    expect(prepared.details.sources[0]?.blockers).toContain("empty-summary");

    const sourceId = prepared.details.sources[0]?.sourceId;
    expect(sourceId).toBeTruthy();

    const blockedFinalize = runCli([
      "--json",
      "--wiki-root",
      wikiRoot,
      "ingest",
      "finalize",
      "--source-id",
      sourceId as string,
    ], path.resolve("extension"));
    expect(blockedFinalize.status).toBe(0);

    const ensure = runCli([
      "--json",
      "--wiki-root",
      wikiRoot,
      "ensure-page",
      "--type",
      "concept",
      "--title",
      "Portable CLI Runtime",
      "--domain",
      "technical",
      "--summary",
      "Target page for integration.",
    ], path.resolve("extension"));
    expect(ensure.status).toBe(0);
    const ensured = JSON.parse(ensure.stdout) as { details: { path: string } };
    const targetPath = ensured.details.path;

    const targetAbsPath = path.join(wikiRoot, targetPath);
    writeFileSync(
      targetAbsPath,
      readFileSync(targetAbsPath, "utf8").replace("source_ids: []", `source_ids:\n  - ${sourceId}`),
      "utf8",
    );

    const sourcePagePath = path.join(wikiRoot, "pages", "sources", `${sourceId}.md`);
    writeFileSync(
      sourcePagePath,
      readFileSync(sourcePagePath, "utf8")
        .replace("integration_targets: []", `integration_targets:\n  - ${targetPath}`)
        .replace("summary: ''", "summary: Captured Source supports Portable CLI Runtime."),
      "utf8",
    );

    const finalize = runCli([
      "--json",
      "--wiki-root",
      wikiRoot,
      "ingest",
      "finalize",
      "--source-id",
      sourceId as string,
    ], path.resolve("extension"));

    expect(finalize.status).toBe(0);
    const finalized = JSON.parse(finalize.stdout) as {
      ok: boolean;
      details: { finalized: string[] };
    };
    expect(finalized.ok).toBe(true);
    expect(finalized.details.finalized).toEqual([sourceId]);

    const manifest = JSON.parse(readFileSync(path.join(wikiRoot, "raw", sourceId as string, "manifest.json"), "utf8")) as {
      status: string;
    };
    expect(manifest.status).toBe("integrated");
  });
});
