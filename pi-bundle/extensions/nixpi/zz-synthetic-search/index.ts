import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const SYNTHETIC_SEARCH_URL = "https://api.synthetic.new/v2/search";
const SEARCH_CACHE_DIR = join(process.env.HOME || "/tmp", ".pi", "agent", "synthetic-search-cache");
const SYNTHETIC_API_KEY_FILE_ENV = "PI_SYNTHETIC_API_KEY_FILE";
const DEFAULT_SYNTHETIC_API_KEY_FILES = [
  "/run/secrets/synthetic_api_key",
];

const WebSearchParams = Type.Object({
  query: Type.Optional(Type.String({ description: "Single search query." })),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Multiple queries searched in sequence." })),
  numResults: Type.Optional(Type.Integer({ description: "Maximum results per query to keep.", minimum: 1, maximum: 20 })),
  includeContent: Type.Optional(Type.Boolean({ description: "Ignored for Synthetic search; snippets are returned directly." })),
  recencyFilter: Type.Optional(Type.String({ description: "Approximate recency hint appended to the query." })),
  domainFilter: Type.Optional(Type.Array(Type.String(), { description: "Optional domain filters; translated into site: terms when possible." })),
  provider: Type.Optional(Type.String({ description: "Ignored; Synthetic search is always used." })),
  workflow: Type.Optional(Type.String({ description: "Ignored; Synthetic search runs directly." })),
});

type SearchResult = {
  url: string;
  title?: string;
  text?: string;
  published?: string;
};

type CachedQuery = {
  inputQuery: string;
  effectiveQuery: string;
  results: SearchResult[];
};

type CachedResponse = {
  responseId: string;
  provider: "synthetic";
  createdAt: string;
  warnings: string[];
  queries: CachedQuery[];
};

function syntheticApiKeyFileCandidates(): string[] {
  const configured = process.env[SYNTHETIC_API_KEY_FILE_ENV]?.trim();
  return [configured, ...DEFAULT_SYNTHETIC_API_KEY_FILES].filter((value, index, items): value is string => {
    return Boolean(value) && items.indexOf(value) === index;
  });
}

function readSyntheticApiKeyFromFile(path: string): string | null {
  if (!existsSync(path)) return null;
  const apiKey = readFileSync(path, "utf8").trim();
  return apiKey || null;
}

function readSyntheticApiKey(): string {
  for (const path of syntheticApiKeyFileCandidates()) {
    const apiKey = readSyntheticApiKeyFromFile(path);
    if (apiKey) return apiKey;
  }

  throw new Error(`Synthetic API key not available via ${SYNTHETIC_API_KEY_FILE_ENV}`);
}

function ensureCacheDir(): void {
  mkdirSync(SEARCH_CACHE_DIR, { recursive: true });
}

function cachePath(responseId: string): string {
  return join(SEARCH_CACHE_DIR, `${responseId}.json`);
}

function buildEffectiveQuery(query: string, domainFilter?: string[], recencyFilter?: string): { effectiveQuery: string; warnings: string[] } {
  const warnings: string[] = [];
  const parts = [query.trim()];

  if (domainFilter && domainFilter.length > 0) {
    const translated = domainFilter.map((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith("-")) return `-site:${trimmed.slice(1)}`;
      return `site:${trimmed}`;
    }).filter((entry): entry is string => Boolean(entry));

    if (translated.length > 0) {
      parts.push(translated.join(" "));
      warnings.push("domainFilter translated into query site: terms");
    }
  }

  if (recencyFilter) {
    parts.push(`recent ${recencyFilter}`);
    warnings.push("recencyFilter applied as a textual query hint");
  }

  return {
    effectiveQuery: parts.join(" ").trim(),
    warnings,
  };
}

async function searchSynthetic(query: string, apiKey: string): Promise<SearchResult[]> {
  const response = await fetch(SYNTHETIC_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Synthetic search failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { results?: SearchResult[] };
  return Array.isArray(data.results) ? data.results : [];
}

function formatResult(result: SearchResult): string {
  const title = result.title?.trim() || result.url;
  const snippet = (result.text || "").replace(/\s+/g, " ").trim();
  const published = result.published ? ` (${result.published})` : "";
  return `- ${title}${published}\n  ${result.url}${snippet ? `\n  ${snippet}` : ""}`;
}

function formatQueries(queries: CachedQuery[]): string {
  return queries
    .map((entry) => {
      const lines = [`Query: ${entry.inputQuery}`];
      if (entry.effectiveQuery !== entry.inputQuery) lines.push(`Effective query: ${entry.effectiveQuery}`);
      if (entry.results.length === 0) lines.push("- No results");
      else lines.push(...entry.results.map(formatResult));
      return lines.join("\n");
    })
    .join("\n\n");
}

export default function syntheticSearchExtension(pi: ExtensionAPI) {
  try {
    readSyntheticApiKey();
  } catch {
    return;
  }

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web via Synthetic's zero-data-retention /v2/search endpoint. Supports a single query or a small list of queries.",
    promptSnippet: "Use web_search for web research questions. This runtime routes web_search through Synthetic's /v2/search endpoint.",
    promptGuidelines: [
      "Prefer queries with 2-4 varied angles over a single query when broader web research is needed.",
      "Synthetic search returns raw search results and snippets directly; summarize them yourself when needed.",
    ],
    parameters: WebSearchParams,
    async execute(_toolCallId, params) {
      const requestedQueries = params.queries && params.queries.length > 0
        ? params.queries
        : params.query
          ? [params.query]
          : [];

      if (requestedQueries.length === 0) {
        throw new Error("web_search requires query or queries");
      }

      const apiKey = readSyntheticApiKey();
      const numResults = params.numResults ?? 5;
      const responseId = randomUUID();
      const warnings = new Set<string>();
      const cachedQueries: CachedQuery[] = [];

      for (const inputQuery of requestedQueries) {
        const { effectiveQuery, warnings: queryWarnings } = buildEffectiveQuery(inputQuery, params.domainFilter, params.recencyFilter);
        for (const warning of queryWarnings) warnings.add(warning);
        const results = (await searchSynthetic(effectiveQuery, apiKey)).slice(0, numResults);
        cachedQueries.push({ inputQuery, effectiveQuery, results });
      }

      ensureCacheDir();
      const cachedResponse: CachedResponse = {
        responseId,
        provider: "synthetic",
        createdAt: new Date().toISOString(),
        warnings: Array.from(warnings),
        queries: cachedQueries,
      };
      writeFileSync(cachePath(responseId), `${JSON.stringify(cachedResponse, null, 2)}\n`, "utf8");

      const warningText = cachedResponse.warnings.length > 0 ? `Warnings: ${cachedResponse.warnings.join("; ")}\n\n` : "";
      return {
        content: [{
          type: "text",
          text: `${warningText}${formatQueries(cachedQueries)}\n\nresponseId: ${responseId}`,
        }],
        details: {
          ok: true,
          responseId,
          provider: "synthetic",
          warnings: cachedResponse.warnings,
          queryCount: cachedQueries.length,
        },
      };
    },
  });
}
