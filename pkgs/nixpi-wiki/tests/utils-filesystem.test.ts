import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteFile, ensureDir } from "../extension/lib/filesystem.ts";
import { err, ok } from "../extension/lib/core-utils.ts";
import { ActionResult, EmptyToolParams, errorResult, nowIso, registerTools, textToolResult, toToolResult, truncate } from "../extension/lib/utils.ts";

describe("utils and filesystem helpers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "nixpi-wiki-utils-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("ensureDir is idempotent and atomicWriteFile writes content", () => {
    const dir = path.join(tempDir, "nested", "dir");
    ensureDir(dir);
    expect(existsSync(dir)).toBe(true);
    ensureDir(dir);

    const file = path.join(dir, "note.txt");
    atomicWriteFile(file, "hello");
    expect(readFileSync(file, "utf8")).toBe("hello");

    atomicWriteFile(file, "updated");
    expect(readFileSync(file, "utf8")).toBe("updated");
  });

  it("textToolResult, errorResult, and toToolResult convert action results", () => {
    const okResult = toToolResult(ok({ text: "worked", details: { a: 1 } }) as ActionResult<{ a: number }>);
    expect(okResult).toEqual({ content: [{ type: "text", text: "worked" }], details: { a: 1 } });

    const errConverted = toToolResult(err("failed") as ActionResult<Record<string, never>>);
    expect(errConverted.isError).toBe(true);
    expect(errConverted.content[0]?.text).toBe("failed");

    const explicitError = errorResult("boom");
    expect(explicitError.isError).toBe(true);
    expect(explicitError.content[0]?.text).toBe("boom");

    const explicitText = textToolResult("plain", { ok: true });
    expect(explicitText.details).toEqual({ ok: true });
  });

  it("truncate shortens large text and nowIso omits milliseconds", () => {
    const long = `${Array.from({ length: 2500 }, (_, i) => `line-${i}`).join("\n")}`;
    const truncated = truncate(long);
    expect(truncated).toContain("line-0");
    expect(truncated.split("\n").length).toBeLessThanOrEqual(2000);
    expect(nowIso()).toMatch(/Z$/);
    expect(nowIso()).not.toContain(".");
  });

  it("registerTools registers each provided tool and EmptyToolParams is an object schema", () => {
    const tools: Array<{ name: string }> = [{ name: "alpha" }, { name: "beta" }];
    const registered: string[] = [];
    registerTools({ registerTool: (tool: { name: string }) => registered.push(tool.name) } as never, tools as never);
    expect(registered).toEqual(["alpha", "beta"]);
    expect((EmptyToolParams as { type?: string }).type).toBe("object");
  });

  it("atomicWriteFile creates parent directories for brand new files", () => {
    const file = path.join(tempDir, "brand", "new", "file.md");
    atomicWriteFile(file, "seed");
    expect(readFileSync(file, "utf8")).toBe("seed");
    writeFileSync(file, "manual", "utf8");
    atomicWriteFile(file, "final");
    expect(readFileSync(file, "utf8")).toBe("final");
  });
});
