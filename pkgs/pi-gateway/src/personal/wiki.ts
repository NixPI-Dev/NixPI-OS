import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

export type RegistryEntry = {
  type: string;
  path: string;
  folder: string;
  title: string;
  status?: string;
  hosts?: string[];
  domain?: string;
  areas?: string[];
  updated?: string;
  due?: string;
  startDate?: string;
  remindAt?: string;
};

export type RegistryData = {
  version: number;
  generatedAt: string;
  pages: RegistryEntry[];
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeList(value: unknown): string[] {
  return [...new Set(asStringArray(value).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
}

function getWikiRootFromRootsEnv(): string | null {
  for (const entry of (process.env.PI_LLM_WIKI_ROOTS ?? "").split(",")) {
    const [name, ...rest] = entry.split(":");
    if (name?.trim().toLowerCase() === "personal") {
      const root = rest.join(":").trim();
      if (root) return root;
    }
  }
  return null;
}

export function getPersonalWikiRoot(): string {
  return (
    process.env.PI_LLM_WIKI_DIR_PERSONAL ??
    getWikiRootFromRootsEnv() ??
    process.env.PI_LLM_WIKI_DIR ??
    path.join(os.homedir(), "NixPI", "wiki", "personal")
  );
}

function walkMarkdownFiles(dir: string, results: string[]): void {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  if (!raw.startsWith("---\n")) return {};
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return {};

  const frontmatter = raw.slice(4, end);
  try {
    const parsed = YAML.parse(frontmatter);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function pageFolder(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const withoutPagesPrefix = normalized.startsWith("pages/") ? normalized.slice("pages/".length) : normalized;
  const dir = path.posix.dirname(withoutPagesPrefix);
  return dir === "." ? "" : dir;
}

function buildRegistryEntry(wikiRoot: string, filePath: string): RegistryEntry {
  const relativePath = path.relative(wikiRoot, filePath).replace(/\\/g, "/");
  const frontmatter = parseFrontmatter(readFileSync(filePath, "utf-8"));
  const folder = pageFolder(relativePath);

  return {
    type: asString(frontmatter.type, "concept"),
    path: relativePath,
    folder,
    title: asString(frontmatter.title) || path.basename(relativePath, ".md"),
    status: asString(frontmatter.status, "draft"),
    hosts: normalizeList(frontmatter.hosts),
    domain: asString(frontmatter.domain) || "personal",
    areas: normalizeList(frontmatter.areas),
    updated: asString(frontmatter.updated),
    ...(frontmatter.due ? { due: asString(frontmatter.due) } : {}),
    ...(frontmatter.start ? { startDate: asString(frontmatter.start) } : {}),
    ...(frontmatter.remind_at ? { remindAt: asString(frontmatter.remind_at) } : {}),
  };
}

function atomicWriteFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}

export function rebuildPersonalRegistry(wikiRoot = getPersonalWikiRoot()): RegistryData {
  const pagesDir = path.join(wikiRoot, "pages");
  const files: string[] = [];
  walkMarkdownFiles(pagesDir, files);
  files.sort();

  const registry: RegistryData = {
    version: 1,
    generatedAt: new Date().toISOString(),
    pages: files.map((filePath) => buildRegistryEntry(wikiRoot, filePath)).sort((a, b) => a.path.localeCompare(b.path)),
  };

  atomicWriteFile(path.join(wikiRoot, "meta", "registry.json"), JSON.stringify(registry, null, 2));
  return registry;
}

export function loadPersonalRegistry(wikiRoot = getPersonalWikiRoot()): RegistryData {
  const registryPath = path.join(wikiRoot, "meta", "registry.json");
  if (existsSync(registryPath)) {
    try {
      return JSON.parse(readFileSync(registryPath, "utf-8")) as RegistryData;
    } catch {
      // Fall through to a rebuild if metadata is corrupt.
    }
  }
  return rebuildPersonalRegistry(wikiRoot);
}
