import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ── Config ─────────────────────────────────────────────────────────────────

const SYNTHETIC_BASE_URL = "https://api.synthetic.new/openai/v1";
const SYNTHETIC_MODELS_URL = "https://api.synthetic.new/openai/v1/models";
const SYNTHETIC_SEARCH_URL = "https://api.synthetic.new/v2/search";

const SYNTHETIC_API_KEY_FILE_ENV = "PI_SYNTHETIC_API_KEY_FILE";
const DEFAULT_SYNTHETIC_API_KEY_FILES = ["/run/secrets/synthetic_api_key"];

const REASONING_EFFORT_MAP = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
} as const;

const SEARCH_CACHE_DIR = join(process.env.HOME || "/tmp", ".pi", "agent", "synthetic-search-cache");

// ── API key ────────────────────────────────────────────────────────────────

function apiKeyFileCandidates(): string[] {
  const configured = process.env[SYNTHETIC_API_KEY_FILE_ENV]?.trim();
  return [configured, ...DEFAULT_SYNTHETIC_API_KEY_FILES].filter(
    (v, i, a): v is string => Boolean(v) && a.indexOf(v) === i,
  );
}

function readApiKey(): string | null {
  for (const path of apiKeyFileCandidates()) {
    if (existsSync(path)) {
      const key = readFileSync(path, "utf-8").trim();
      if (key) return key;
    }
  }
  return null;
}

function requireApiKey(): string {
  const key = readApiKey();
  if (!key) throw new Error(`Synthetic API key not found. Set ${SYNTHETIC_API_KEY_FILE_ENV} or place key in ${DEFAULT_SYNTHETIC_API_KEY_FILES[0]}`);
  return key;
}

// ── Model definitions ───────────────────────────────────────────────────────
// Hardcoded from https://api.synthetic.new/openai/v1/models
// Pricing is per-million tokens (converted from per-token prices in the API).

type ModelDef = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
};

const MODELS: ModelDef[] = [
  {
    id: "hf:zai-org/GLM-5.1",
    name: "GLM 5.1",
    reasoning: true,
    input: ["text"],
    cost: { input: 1, output: 3, cacheRead: 1, cacheWrite: 0 },
    contextWindow: 196608,
    maxTokens: 65536,
  },
  {
    id: "hf:moonshotai/Kimi-K2.5",
    name: "Kimi K2.5",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.45, output: 3.4, cacheRead: 0.45, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  {
    id: "hf:nvidia/Kimi-K2.5-NVFP4",
    name: "Kimi K2.5 NVFP4",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.45, output: 3.4, cacheRead: 0.45, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  {
    id: "hf:MiniMaxAI/MiniMax-M2.5",
    name: "MiniMax M2.5",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.4, output: 2, cacheRead: 0.4, cacheWrite: 0 },
    contextWindow: 191488,
    maxTokens: 65536,
  },
  {
    id: "hf:zai-org/GLM-4.7-Flash",
    name: "GLM 4.7 Flash",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.1, output: 0.5, cacheRead: 0.1, cacheWrite: 0 },
    contextWindow: 196608,
    maxTokens: 65536,
  },
  {
    id: "hf:zai-org/GLM-5",
    name: "GLM 5",
    reasoning: true,
    input: ["text"],
    cost: { input: 1, output: 3, cacheRead: 1, cacheWrite: 0 },
    contextWindow: 196608,
    maxTokens: 65536,
  },
  {
    id: "hf:nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
    name: "Nemotron 3 Super 120B",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.3, output: 1, cacheRead: 0.3, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  {
    id: "hf:zai-org/GLM-4.7",
    name: "GLM 4.7",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.45, output: 2.19, cacheRead: 0.45, cacheWrite: 0 },
    contextWindow: 202752,
    maxTokens: 65536,
  },
  {
    id: "hf:deepseek-ai/DeepSeek-V3.2",
    name: "DeepSeek V3.2",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.56, output: 1.68, cacheRead: 0.56, cacheWrite: 0 },
    contextWindow: 162816,
    maxTokens: 65536,
  },
  {
    id: "hf:Qwen/Qwen3-Coder-480B-A35B-Instruct",
    name: "Qwen3 Coder 480B",
    reasoning: true,
    input: ["text"],
    cost: { input: 2, output: 2, cacheRead: 2, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  {
    id: "hf:Qwen/Qwen3.5-397B-A17B",
    name: "Qwen3.5 397B",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.6, output: 3.6, cacheRead: 0.6, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  {
    id: "hf:Qwen/Qwen3-235B-A22B-Thinking-2507",
    name: "Qwen3 235B Thinking",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.65, output: 3, cacheRead: 0.65, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 65536,
  },
  {
    id: "hf:deepseek-ai/DeepSeek-R1-0528",
    name: "DeepSeek R1",
    reasoning: true,
    input: ["text"],
    cost: { input: 3, output: 8, cacheRead: 3, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 65536,
  },
  {
    id: "hf:openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.1, output: 0.1, cacheRead: 0.1, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 65536,
  },
  {
    id: "hf:meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.88, output: 0.88, cacheRead: 0.88, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 65536,
  },
];

// ── Web search ───────────────────────────────────────────────────────────────

const WebSearchParams = Type.Object({
  query: Type.Optional(Type.String({ description: "Single search query." })),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Multiple queries searched in sequence." })),
  numResults: Type.Optional(Type.Integer({ description: "Maximum results per query to keep.", minimum: 1, maximum: 20 })),
  recencyFilter: Type.Optional(Type.String({ description: "Approximate recency hint appended to the query." })),
  domainFilter: Type.Optional(Type.Array(Type.String(), { description: "Optional domain filters; translated into site: terms when possible." })),
  includeContent: Type.Optional(Type.Boolean({ description: "Ignored for Synthetic search; snippets are returned directly." })),
  provider: Type.Optional(Type.String({ description: "Ignored; Synthetic search is always used." })),
  workflow: Type.Optional(Type.String({ description: "Ignored; Synthetic search runs directly." })),
});

type SearchResult = { url: string; title?: string; text?: string; published?: string };
type CachedQuery = { inputQuery: string; effectiveQuery: string; results: SearchResult[] };
type CachedResponse = {
  responseId: string;
  provider: "synthetic";
  createdAt: string;
  warnings: string[];
  queries: CachedQuery[];
};

function buildEffectiveQuery(query: string, domainFilter?: string[], recencyFilter?: string) {
  const warnings: string[] = [];
  const parts = [query.trim()];

  if (domainFilter?.length) {
    const translated = domainFilter
      .map((e) => {
        const t = e.trim();
        if (!t) return null;
        return t.startsWith("-") ? `-site:${t.slice(1)}` : `site:${t}`;
      })
      .filter((e): e is string => Boolean(e));
    if (translated.length) {
      parts.push(translated.join(" "));
      warnings.push("domainFilter translated into query site: terms");
    }
  }

  if (recencyFilter) {
    parts.push(`recent ${recencyFilter}`);
    warnings.push("recencyFilter applied as a textual query hint");
  }

  return { effectiveQuery: parts.join(" ").trim(), warnings };
}

async function searchSynthetic(query: string, apiKey: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const response = await fetch(SYNTHETIC_SEARCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Synthetic search failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { results?: SearchResult[] };
  return Array.isArray(data.results) ? data.results : [];
}

function formatResult(r: SearchResult): string {
  const title = r.title?.trim() || r.url;
  const snippet = (r.text || "").replace(/\s+/g, " ").trim();
  const pub = r.published ? ` (${r.published})` : "";
  return `- ${title}${pub}\n  ${r.url}${snippet ? `\n  ${snippet}` : ""}`;
}

// ── Extension ────────────────────────────────────────────────────────────────

export default function syntheticExtension(pi: ExtensionAPI) {
  const apiKey = readApiKey();
  if (!apiKey) return; // Silently skip if no key available

  // ── Register provider ────────────────────────────────────────────────

  pi.registerProvider("synthetic", {
    baseUrl: SYNTHETIC_BASE_URL,
    apiKey,
    api: "openai-completions",
    models: MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: m.input,
      cost: m.cost,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        reasoningEffortMap: REASONING_EFFORT_MAP,
      },
    })),
  });

  // ── Web search tool ──────────────────────────────────────────────────

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web via Synthetic's zero-data-retention /v2/search endpoint. Supports a single query or a small list of queries.",
    promptSnippet:
      "Use web_search for web research questions. This runtime routes web_search through Synthetic's /v2/search endpoint.",
    promptGuidelines: [
      "Prefer queries with 2-4 varied angles over a single query when broader web research is needed.",
      "Synthetic search returns raw search results and snippets directly; summarize them yourself when needed.",
    ],
    parameters: WebSearchParams,
    async execute(_toolCallId, params, signal) {
      const requestedQueries =
        params.queries?.length ? params.queries : params.query ? [params.query] : [];
      if (!requestedQueries.length) throw new Error("web_search requires query or queries");

      const key = requireApiKey();
      const numResults = params.numResults ?? 5;
      const responseId = randomUUID();
      const warnings = new Set<string>();
      const cachedQueries: CachedQuery[] = [];

      for (const inputQuery of requestedQueries) {
        const { effectiveQuery, warnings: qw } = buildEffectiveQuery(
          inputQuery,
          params.domainFilter,
          params.recencyFilter,
        );
        for (const w of qw) warnings.add(w);
        const results = (await searchSynthetic(effectiveQuery, key, signal)).slice(0, numResults);
        cachedQueries.push({ inputQuery, effectiveQuery, results });
      }

      mkdirSync(SEARCH_CACHE_DIR, { recursive: true });
      const cached: CachedResponse = {
        responseId,
        provider: "synthetic",
        createdAt: new Date().toISOString(),
        warnings: Array.from(warnings),
        queries: cachedQueries,
      };
      writeFileSync(join(SEARCH_CACHE_DIR, `${responseId}.json`), `${JSON.stringify(cached, null, 2)}\n`, "utf-8");

      const warningText = cached.warnings.length ? `Warnings: ${cached.warnings.join("; ")}\n\n` : "";
      const body = cachedQueries
        .map((q) => {
          const lines = [`Query: ${q.inputQuery}`];
          if (q.effectiveQuery !== q.inputQuery) lines.push(`Effective query: ${q.effectiveQuery}`);
          if (!q.results.length) lines.push("- No results");
          else lines.push(...q.results.map(formatResult));
          return lines.join("\n");
        })
        .join("\n\n");

      return {
        content: [{ type: "text", text: `${warningText}${body}\n\nresponseId: ${responseId}` }],
        details: { ok: true, responseId, provider: "synthetic", warnings: cached.warnings, queryCount: cachedQueries.length },
      };
    },
  });

  // ── /synthetic command ───────────────────────────────────────────────

  pi.registerCommand("synthetic", {
    description: "Show Synthetic provider models and status",
    handler: async (_args, ctx) => {
      const lines = ["Synthetic provider: registered", "", "Models:"];
      for (const m of MODELS) {
        const vision = m.input.includes("image") ? " [vision]" : "";
        const think = m.reasoning ? " [reasoning]" : "";
        const cost = `$${m.cost.input}/${m.cost.output}`;
        lines.push(`  ${m.name}${vision}${think} — ${m.contextWindow.toLocaleString()} ctx, ${cost} per M tokens`);
      }
      if (ctx.hasUI) ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
