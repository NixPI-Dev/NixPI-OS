import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockExtensionAPI } from "./helpers/mock-extension-api.ts";

const state = vi.hoisted(() => ({
  wikiRoot: "/tmp/wiki-root",
  technicalRoot: "/tmp/wiki-technical",
  personalRoot: "/tmp/wiki-personal",
  host: "pad-nixos",
  digest: "",
  allowedDomains: undefined as string[] | undefined,
  protectWrite: false,
  pagePath: false,
  captureShouldFail: false,
  rebuildCalls: [] as string[],
  captureCalls: [] as Array<{ wikiRoot: string; kind: "text" | "file"; params: Record<string, unknown> }>,
  searchCalls: [] as Array<{ wikiRoot: string; query: string; options: Record<string, unknown> }>,
  ensureCalls: [] as Array<{ wikiRoot: string; params: Record<string, unknown> }>,
  lintCalls: [] as Array<{ wikiRoot: string; mode: unknown }>,
}));

vi.mock("../extension/paths.js", () => ({
  getWikiRoot: () => state.wikiRoot,
  getWikiRootForDomain: (domain?: string) => {
    if (domain?.trim().toLowerCase() === "technical") return state.technicalRoot;
    if (domain?.trim().toLowerCase() === "personal") return state.personalRoot;
    return state.wikiRoot;
  },
  getWikiRoots: () => ({ technical: state.technicalRoot, personal: state.personalRoot }),
  getCurrentHost: () => state.host,
  getAllowedDomains: () => state.allowedDomains,
  isProtectedPath: () => state.protectWrite,
  isWikiPagePath: () => state.pagePath,
}));

vi.mock("../extension/actions-meta.js", () => ({
  buildWikiDigest: () => state.digest,
  handleWikiStatus: () => ({ isErr: () => false, value: { text: "ok", details: { initialized: true } } }),
  loadRegistry: (wikiRoot: string) => ({ version: 1, generatedAt: "now", pages: [], wikiRoot }),
  rebuildAllMeta: (wikiRoot: string) => {
    state.rebuildCalls.push(wikiRoot);
    return {
      registry: { version: 1, generatedAt: "now", pages: [] },
      backlinks: { version: 1, generatedAt: "now", byPath: {} },
    };
  },
}));

vi.mock("../extension/actions-capture.js", () => ({
  captureText: (wikiRoot: string, _value: string, params: Record<string, unknown>) => {
    state.captureCalls.push({ wikiRoot, kind: "text", params });
    if (state.captureShouldFail) {
      return { isErr: () => true, isOk: () => false, error: "capture failed" };
    }
    return { isErr: () => false, isOk: () => true, value: { text: "captured", details: {} } };
  },
  captureFile: (wikiRoot: string, _value: string, params: Record<string, unknown>) => {
    state.captureCalls.push({ wikiRoot, kind: "file", params });
    if (state.captureShouldFail) {
      return { isErr: () => true, isOk: () => false, error: "capture failed" };
    }
    return { isErr: () => false, isOk: () => true, value: { text: "captured-file", details: {} } };
  },
}));

vi.mock("../extension/actions-search.js", () => ({
  handleWikiSearch: (registry: { wikiRoot?: string }, query: string, options: Record<string, unknown>) => {
    state.searchCalls.push({ wikiRoot: registry.wikiRoot ?? state.wikiRoot, query, options });
    return { isErr: () => false, isOk: () => true, value: { text: "search", details: {} } };
  },
}));

vi.mock("../extension/actions-pages.js", () => ({
  handleEnsurePage: (wikiRoot: string, params: Record<string, unknown>) => {
    state.ensureCalls.push({ wikiRoot, params });
    return { isErr: () => false, isOk: () => true, value: { text: "ensured", details: {} } };
  },
}));

vi.mock("../extension/actions-lint.js", () => ({
  handleWikiLint: (wikiRoot: string, mode: unknown) => {
    state.lintCalls.push({ wikiRoot, mode });
    return { isErr: () => false, isOk: () => true, value: { text: "lint", details: {} } };
  },
}));

describe("llm-wiki extension wiring", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    state.wikiRoot = path.join("/tmp", "llm-wiki-index-test");
    state.technicalRoot = path.join("/tmp", "llm-wiki-index-test-technical");
    state.personalRoot = path.join("/tmp", "llm-wiki-index-test-personal");
    rmSync(state.wikiRoot, { recursive: true, force: true });
    rmSync(state.technicalRoot, { recursive: true, force: true });
    rmSync(state.personalRoot, { recursive: true, force: true });
    mkdirSync(state.wikiRoot, { recursive: true });
    mkdirSync(state.technicalRoot, { recursive: true });
    mkdirSync(state.personalRoot, { recursive: true });
    process.env.HOME = path.join("/tmp", "llm-wiki-home-test");
    rmSync(process.env.HOME, { recursive: true, force: true });
    mkdirSync(process.env.HOME, { recursive: true });
    process.env.PI_LLM_WIKI_ROOTS = `technical:${state.technicalRoot},personal:${state.personalRoot}`;
    state.host = "pad-nixos";
    state.digest = "";
    state.allowedDomains = undefined;
    state.protectWrite = false;
    state.pagePath = false;
    state.captureShouldFail = false;
    state.rebuildCalls = [];
    state.captureCalls = [];
    state.searchCalls = [];
    state.ensureCalls = [];
    state.lintCalls = [];
  });

  afterEach(() => {
    rmSync(state.wikiRoot, { recursive: true, force: true });
    rmSync(state.technicalRoot, { recursive: true, force: true });
    rmSync(state.personalRoot, { recursive: true, force: true });
    if (process.env.HOME) rmSync(process.env.HOME, { recursive: true, force: true });
    if (originalHome) process.env.HOME = originalHome;
    else delete process.env.HOME;
    delete process.env.PI_LLM_WIKI_ROOTS;
    vi.resetModules();
  });

  async function loadExtension() {
    const api = createMockExtensionAPI();
    const mod = await import("../extension/index.ts");
    mod.default(api as never);
    return api;
  }

  async function loadTool(name: string) {
    const api = await loadExtension();
    const tool = api._registeredTools.find((entry) => entry.name === name);
    if (!tool || typeof tool.execute !== "function") {
      throw new Error(`Tool ${name} not found`);
    }
    return {
      api,
      execute: tool.execute as (toolCallId: string, params: Record<string, unknown>) => Promise<{ isError?: boolean }>,
    };
  }

  function seedPersonaPromptPages() {
    const personaDir = path.join(state.technicalRoot, "pages", "projects", "nixpi", "persona");
    mkdirSync(personaDir, { recursive: true });
    writeFileSync(path.join(personaDir, "soul.md"), "---\ntitle: PI Soul\n---\n# PI Soul\nSoul guidance\n");
    writeFileSync(path.join(personaDir, "body.md"), "---\ntitle: PI Body\n---\n# PI Body\nBody guidance\n");
    writeFileSync(path.join(personaDir, "faculty.md"), "---\ntitle: PI Faculty\n---\n# PI Faculty\nFaculty guidance\n");
    writeFileSync(path.join(personaDir, "skill.md"), "---\ntitle: PI Skill\n---\n# PI Skill\nSkill guidance\n");
    writeFileSync(path.join(personaDir, "caveman-lite.md"), "---\ntitle: PI Caveman Lite\n---\n# PI Caveman Lite\nCAVEMAN LITE ACTIVE.\n\nBe terse.\n");
  }

  it("registers all llm-wiki tools", async () => {
    const api = await loadExtension();
    expect(api._registeredTools.map((tool) => tool.name)).toEqual([
      "wiki_status",
      "wiki_capture",
      "wiki_search",
      "wiki_ensure_page",
      "wiki_lint",
      "wiki_rebuild",
    ]);
  });

  it("forwards capture metadata and rebuilds after success", async () => {
    const { execute } = await loadTool("wiki_capture");
    await execute("tool-call", {
      input_type: "text",
      value: "hello world",
      domain: "technical",
      areas: ["infrastructure"],
      hosts: ["pad-nixos"],
    });

    expect(state.captureCalls).toEqual([
      {
          wikiRoot: state.technicalRoot,
        kind: "text",
        params: {
          title: undefined,
          kind: undefined,
          tags: undefined,
          hosts: ["pad-nixos"],
          domain: "technical",
          areas: ["infrastructure"],
        },
      },
    ]);
    expect(state.rebuildCalls).toEqual([state.technicalRoot]);
  });

  it("routes file capture through captureFile and rebuilds after success", async () => {
    const { execute } = await loadTool("wiki_capture");
    await execute("tool-call", {
      input_type: "file",
      value: "/tmp/note.md",
      title: "Imported Note",
      kind: "note",
      tags: ["import"],
    });

    expect(state.captureCalls).toEqual([
      {
        wikiRoot: state.wikiRoot,
        kind: "file",
        params: {
          title: "Imported Note",
          kind: "note",
          tags: ["import"],
          hosts: undefined,
          domain: undefined,
          areas: undefined,
        },
      },
    ]);
    expect(state.rebuildCalls).toEqual([state.wikiRoot]);
  });

  it("does not rebuild after a failed wiki mutation", async () => {
    state.captureShouldFail = true;
    const { execute } = await loadTool("wiki_capture");
    const result = await execute("tool-call", {
      input_type: "text",
      value: "broken",
    });

    expect(result.isError).toBe(true);
    expect(state.rebuildCalls).toEqual([]);
  });

  it("forwards search filters", async () => {
    const { execute } = await loadTool("wiki_search");
    await execute("tool-call", {
      query: "journal",
      domain: "personal",
      areas: ["journal"],
      folder: "journal/daily",
      host_scope: "all",
    });

    expect(state.searchCalls).toEqual([
      {
        wikiRoot: state.personalRoot,
        query: "journal",
        options: {
          type: undefined,
          limit: undefined,
          hostScope: "all",
          domain: "personal",
          areas: ["journal"],
          folder: "journal/daily",
        },
      },
    ]);
  });

  it("forwards folder and journal type to ensure page", async () => {
    const { execute } = await loadTool("wiki_ensure_page");
    await execute("tool-call", {
      type: "journal",
      title: "2026-04-19 Daily Journal",
      folder: "journal/daily",
      domain: "personal",
      areas: ["journal"],
    });

    expect(state.ensureCalls).toEqual([
      {
        wikiRoot: state.personalRoot,
        params: {
          type: "journal",
          title: "2026-04-19 Daily Journal",
          aliases: undefined,
          tags: undefined,
          hosts: undefined,
          domain: "personal",
          areas: ["journal"],
          folder: "journal/daily",
          summary: undefined,
        },
      },
    ]);
    expect(state.rebuildCalls).toEqual([state.personalRoot]);
  });

  it("executes wiki_status, wiki_lint, and wiki_rebuild tools", async () => {
    const status = await loadTool("wiki_status");
    await status.execute("tool-call", {});

    const lint = await loadTool("wiki_lint");
    await lint.execute("tool-call", { mode: "duplicates" });

    const rebuild = await loadTool("wiki_rebuild");
    await rebuild.execute("tool-call", {});

    expect(state.lintCalls).toEqual([{ wikiRoot: state.wikiRoot, mode: "duplicates" }]);
    expect(state.rebuildCalls).toContain(state.wikiRoot);
  });

  it("blocks writes to protected wiki paths", async () => {
    state.protectWrite = true;
    const api = await loadExtension();
    const result = await api.fireEvent("tool_call", {
      toolName: "write",
      input: { path: `${state.wikiRoot}/raw/SRC-001/manifest.json` },
    });

    expect(result).toEqual({ block: true, reason: "Wiki protects raw/ and meta/. Use wiki tools instead." });
  });

  it("returns undefined for unrelated tool calls and for agent_end when not dirty", async () => {
    const api = await loadExtension();
    const unrelated = await api.fireEvent("tool_call", {
      toolName: "read",
      input: { path: `${state.wikiRoot}/pages/resources/technical/foo.md` },
    });
    expect(unrelated).toBeUndefined();

    await api.fireEvent("agent_end");
    expect(state.rebuildCalls).toEqual([]);
  });

  it("returns undefined for non-protected writes and rebuilds after page writes on agent_end", async () => {
    const api = await loadExtension();
    const result = await api.fireEvent("tool_call", {
      toolName: "write",
      input: { path: `${state.wikiRoot}/pages/resources/technical/foo.md` },
    });
    expect(result).toBeUndefined();

    state.pagePath = true;
    await api.fireEvent("tool_call", {
      toolName: "write",
      input: { path: `${state.wikiRoot}/pages/resources/technical/foo.md` },
    });
    await api.fireEvent("agent_end");

    expect(state.rebuildCalls).toEqual([state.wikiRoot]);
  });

  it("marks page edits dirty and rebuilds on agent_end", async () => {
    state.pagePath = true;
    const api = await loadExtension();
    await api.fireEvent("tool_call", {
      toolName: "edit",
      input: { path: `${state.wikiRoot}/pages/resources/technical/foo.md` },
    });
    await api.fireEvent("agent_end");

    expect(state.rebuildCalls).toEqual([state.wikiRoot]);
  });

  it("injects wiki context, digest, persona, and caveman prompt blocks before agent start", async () => {
    seedPersonaPromptPages();
    state.digest = "\n\n[WIKI PLANNER DIGEST — pad-nixos — 2026-04-21]\n- Shared Note";
    const api = await loadExtension();
    const result = (await api.fireEvent("before_agent_start", { systemPrompt: "BASE" })) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("BASE");
    expect(result.systemPrompt).toContain("Plain-Markdown wiki");
    expect(result.systemPrompt).toContain("domain: technical or personal");
    expect(result.systemPrompt).toContain("planner/tasks");
    expect(result.systemPrompt).toContain("[WIKI PLANNER DIGEST");
    expect(result.systemPrompt).toContain("[PI PERSONA]");
    expect(result.systemPrompt).toContain("# PI Soul");
    expect(result.systemPrompt).toContain("# PI Skill");
    expect(result.systemPrompt).toContain("[CAVEMAN LITE]");
    expect(result.systemPrompt).toContain("CAVEMAN LITE ACTIVE.");
  });

  it("injects domain restrictions into the context when configured", async () => {
    state.allowedDomains = ["technical", "personal"];
    const api = await loadExtension();
    const result = (await api.fireEvent("before_agent_start", { systemPrompt: "BASE" })) as { systemPrompt: string };
    expect(result.systemPrompt).toContain("Domain access is restricted to: [technical, personal]");
  });

  it("injects context even when digest is empty", async () => {
    const api = await loadExtension();
    const result = (await api.fireEvent("before_agent_start", { systemPrompt: "BASE" })) as { systemPrompt: string };
    expect(result.systemPrompt).toContain("BASE");
    expect(result.systemPrompt).toContain("[LLM WIKI CONTEXT]");
    expect(result.systemPrompt).not.toContain("[WIKI PLANNER DIGEST");
  });

  it("updates caveman status on session_start without owning shell policy", async () => {
    const api = await loadExtension();
    const notify = vi.fn();
    const setStatus = vi.fn();

    await api.fireEvent("session_start", {}, {
      hasUI: true,
      ui: { notify, setStatus, setWidget: vi.fn() },
      sessionManager: { getEntries: () => [] },
    });

    const result = await api.fireEvent("tool_call", {
      toolName: "bash",
      input: { command: "rm -rf /" },
    }, {
      hasUI: true,
      ui: { notify },
    });

    expect(result).toBeUndefined();
    expect(setStatus).toHaveBeenCalledWith("caveman-lite", "caveman-lite: on");
  });

  it("injects restored context from the saved context file", async () => {
    seedPersonaPromptPages();
    const contextDir = path.join(process.env.HOME!, ".pi", "agent");
    mkdirSync(contextDir, { recursive: true });
    writeFileSync(path.join(contextDir, "context.json"), JSON.stringify({ savedAt: "2026-04-23T00:00:00.000Z", host: "old-host", cwd: "/tmp/project" }));

    const api = await loadExtension();
    const result = (await api.fireEvent("before_agent_start", { systemPrompt: "BASE" })) as { systemPrompt: string };
    expect(result.systemPrompt).toContain("[RESTORED CONTEXT]");
    expect(result.systemPrompt).toContain("Previous host: old-host");
    expect(result.systemPrompt).toContain("Previous cwd: /tmp/project");
  });

  it("writes compaction context and returns compaction guidance", async () => {
    const api = await loadExtension();
    const result = (await api.fireEvent("session_before_compact", {
      preparation: { tokensBefore: 1234, firstKeptEntryId: "entry-1" },
    }, {
      cwd: "/tmp/worktree",
    })) as { compaction: { summary: string; firstKeptEntryId: string; tokensBefore: number } };

    const saved = JSON.parse(readFileSync(path.join(process.env.HOME!, ".pi", "agent", "context.json"), "utf-8"));
    expect(saved.cwd).toBe("/tmp/worktree");
    expect(result.compaction.firstKeptEntryId).toBe("entry-1");
    expect(result.compaction.tokensBefore).toBe(1234);
    expect(result.compaction.summary).toContain("COMPACTION GUIDANCE");
  });

  it("registers caveman command and lets it disable the caveman prompt block", async () => {
    seedPersonaPromptPages();
    const api = await loadExtension();
    const command = api._registeredCommands.find((entry) => entry.name === "caveman");
    if (!command || typeof command.handler !== "function") {
      throw new Error("caveman command not found");
    }

    const notify = vi.fn();
    const setStatus = vi.fn();
    await command.handler("off", {
      ui: { notify, setStatus },
      sessionManager: { getEntries: () => [] },
    });

    const result = (await api.fireEvent("before_agent_start", { systemPrompt: "BASE" })) as { systemPrompt: string };
    expect(api._appendedEntries).toEqual([{ customType: "caveman-lite-enabled", data: { enabled: false } }]);
    expect(result.systemPrompt).toContain("[PI PERSONA]");
    expect(result.systemPrompt).not.toContain("[CAVEMAN LITE]");
    expect(setStatus).toHaveBeenCalledWith("caveman-lite", "caveman-lite: off");
    expect(notify).toHaveBeenCalledWith("caveman-lite: off. Takes effect on the next message.", "info");
  });

  it("restores caveman state from session entries on session_start", async () => {
    seedPersonaPromptPages();
    const api = await loadExtension();
    const setStatus = vi.fn();

    await api.fireEvent("session_start", {}, {
      ui: { setStatus },
      sessionManager: {
        getEntries: () => [{ type: "custom", customType: "caveman-lite-enabled", data: { enabled: false } }],
      },
    });

    const result = (await api.fireEvent("before_agent_start", { systemPrompt: "BASE" })) as { systemPrompt: string };
    expect(result.systemPrompt).not.toContain("[CAVEMAN LITE]");
    expect(setStatus).toHaveBeenCalledWith("caveman-lite", "caveman-lite: off");
  });
});
