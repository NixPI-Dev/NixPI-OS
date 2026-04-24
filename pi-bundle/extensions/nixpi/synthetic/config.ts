import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SYNTHETIC_BASE_URL = "https://api.synthetic.new/openai/v1";
export const SYNTHETIC_SEARCH_URL = "https://api.synthetic.new/v2/search";
export const SYNTHETIC_API_KEY_FILE_ENV = "PI_SYNTHETIC_API_KEY_FILE";
export const SYNTHETIC_ALLOWED_MODELS_ENV = "PI_SYNTHETIC_ALLOWED_MODELS";
export const DEFAULT_SYNTHETIC_API_KEY_FILES = ["/run/secrets/synthetic_api_key"];
export const SEARCH_CACHE_DIR = join(process.env.HOME || "/tmp", ".pi", "agent", "synthetic-search-cache");

export const REASONING_EFFORT_MAP = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
} as const;

export function apiKeyFileCandidates(): string[] {
  const configured = process.env[SYNTHETIC_API_KEY_FILE_ENV]?.trim();
  return [configured, ...DEFAULT_SYNTHETIC_API_KEY_FILES].filter(
    (v, i, a): v is string => Boolean(v) && a.indexOf(v) === i,
  );
}

export function readApiKey(): string | null {
  for (const path of apiKeyFileCandidates()) {
    if (!existsSync(path)) continue;
    const key = readFileSync(path, "utf-8").trim();
    if (key) return key;
  }
  return null;
}

export function requireApiKey(): string {
  const key = readApiKey();
  if (!key) {
    throw new Error(
      `Synthetic API key not found. Set ${SYNTHETIC_API_KEY_FILE_ENV} or place key in ${DEFAULT_SYNTHETIC_API_KEY_FILES[0]}`,
    );
  }
  return key;
}

export function syntheticStatus(apiKey: string | null): "ready" | "missing-api-key" {
  return apiKey ? "ready" : "missing-api-key";
}

export function allowedSyntheticModelIds(): string[] | undefined {
  const raw = process.env[SYNTHETIC_ALLOWED_MODELS_ENV]?.trim();
  if (!raw || raw === "*") return undefined;
  return [...new Set(raw.split(",").map((entry) => normalizeSyntheticModelId(entry)).filter(Boolean))];
}

export function normalizeSyntheticModelId(model: string): string {
  const trimmed = model.trim();
  return trimmed.startsWith("synthetic/") ? trimmed.slice("synthetic/".length) : trimmed;
}
