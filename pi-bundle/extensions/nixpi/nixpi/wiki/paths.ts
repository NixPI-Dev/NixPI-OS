import os from "node:os";
import path from "node:path";

export function getWikiRoot(): string {
	return process.env.PI_LLM_WIKI_DIR ?? path.join(os.homedir(), "NixPI", "wiki", "technical");
}

export function getWikiRoots(): Record<string, string> {
	const roots: Record<string, string> = {};
	const raw = process.env.PI_LLM_WIKI_ROOTS ?? "";
	for (const entry of raw.split(",")) {
		const trimmed = entry.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf(":");
		if (separator === -1) continue;
		const domain = normalizeDomain(trimmed.slice(0, separator));
		const wikiRoot = trimmed.slice(separator + 1).trim();
		if (domain && wikiRoot) roots[domain] = wikiRoot;
	}
	return roots;
}

export function getWikiRootForDomain(domain: string | undefined): string {
	const normalized = normalizeDomain(domain);
	if (!normalized) return getWikiRoot();
	return getWikiRoots()[normalized] ?? getWikiRoot();
}

/**
 * Returns the list of domains the current session is allowed to read/write,
 * or undefined if there is no restriction (operator / full-access session).
 * Driven by PI_LLM_WIKI_ALLOWED_DOMAINS (comma-separated, e.g. "technical").
 */
export function getAllowedDomains(): string[] | undefined {
	const raw = process.env.PI_LLM_WIKI_ALLOWED_DOMAINS;
	if (!raw || raw.trim() === "" || raw.trim() === "*") return undefined;
	return raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

/**
 * Returns true when a page with the given domain is accessible in this session.
 * Pages without a domain are always allowed (they are global/unscoped).
 */
export function isDomainAllowed(domain: string | undefined, allowedDomains: string[] | undefined): boolean {
	if (!allowedDomains) return true;
	if (!domain) return true;
	return allowedDomains.includes(domain.toLowerCase());
}

function normalizeLabel(value: string): string {
	return value.trim().toLowerCase();
}

function dedupeNormalized(values: string[] | undefined): string[] {
	if (!values) return [];
	return [...new Set(values.map(normalizeLabel).filter(Boolean))];
}

export function normalizeDomain(domain: string | undefined): string | undefined {
	if (!domain) return undefined;
	const normalized = normalizeLabel(domain);
	return normalized || undefined;
}

export function normalizeAreas(areas: string[] | undefined): string[] {
	return dedupeNormalized(areas);
}

function normalizeHost(host: string): string {
	return normalizeLabel(host);
}

export function getCurrentHost(): string {
	return normalizeHost(process.env.PI_LLM_WIKI_HOST ?? os.hostname());
}

export function normalizeHosts(hosts: string[] | undefined): string[] {
	return hosts ? [...new Set(hosts.map(normalizeHost).filter(Boolean))] : [];
}

export function appliesToHost(hosts: string[] | undefined, host = getCurrentHost()): boolean {
	const normalizedHosts = normalizeHosts(hosts);
	if (normalizedHosts.length === 0) return true;
	if (normalizedHosts.includes("all") || normalizedHosts.includes("*")) return true;
	return normalizedHosts.includes(normalizeHost(host));
}

export function formatHostsSuffix(hosts: string[] | undefined): string {
	const normalizedHosts = normalizeHosts(hosts);
	if (normalizedHosts.length === 0 || normalizedHosts.includes("all") || normalizedHosts.includes("*")) {
		return "";
	}
	return ` [hosts: ${normalizedHosts.join(", ")}]`;
}

export function formatDomainSuffix(domain: string | undefined): string {
	const normalized = normalizeDomain(domain);
	return normalized ? ` [domain: ${normalized}]` : "";
}

export function formatAreasSuffix(areas: string[] | undefined): string {
	const normalized = normalizeAreas(areas);
	return normalized.length > 0 ? ` [areas: ${normalized.join(", ")}]` : "";
}

export function normalizePageFolder(folder: string | undefined): string | undefined {
	if (!folder) return undefined;
	const segments = folder
		.replace(/\\/g, "/")
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean);
	if (segments.length === 0) return undefined;
	if (segments.some((segment) => segment === "." || segment === "..")) {
		throw new Error(`Invalid wiki folder: ${folder}`);
	}
	return segments.join("/");
}

export function buildPagePath(slug: string, folder?: string): string {
	const normalizedFolder = normalizePageFolder(folder);
	return normalizedFolder ? `pages/${normalizedFolder}/${slug}.md` : `pages/${slug}.md`;
}

export function getPageFolder(relativePath: string): string {
	const normalizedPath = relativePath.replace(/\\/g, "/");
	const withoutPagesPrefix = normalizedPath.startsWith("pages/") ? normalizedPath.slice("pages/".length) : normalizedPath;
	const dir = path.posix.dirname(withoutPagesPrefix);
	return dir === "." ? "" : dir;
}

export function folderMatches(pageFolder: string, folderFilter: string | undefined): boolean {
	const normalizedFilter = normalizePageFolder(folderFilter);
	if (!normalizedFilter) return true;
	return pageFolder === normalizedFilter || pageFolder.startsWith(`${normalizedFilter}/`);
}

const DOMAIN_SEGMENTS = new Set(["technical", "personal"]);

export function inferDomainFromFolder(folder: string | undefined): string | undefined {
	const normalizedFolder = normalizePageFolder(folder);
	if (!normalizedFolder) return undefined;
	for (const segment of normalizedFolder.split("/")) {
		if (DOMAIN_SEGMENTS.has(segment)) return segment;
	}
	return undefined;
}

export function slugifyTitle(title: string): string {
	return (
		title
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.replace(/-{2,}/g, "-") || "untitled"
	);
}

export function todayStamp(date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

export function makeSourceId(existingIds: string[], now = new Date()): string {
	const stamp = todayStamp(now);
	const prefix = `SRC-${stamp}-`;
	const used = existingIds
		.filter((id) => id.startsWith(prefix))
		.map((id) => Number.parseInt(id.slice(prefix.length), 10))
		.filter((v) => Number.isFinite(v));
	const next = (used.length === 0 ? 0 : Math.max(...used)) + 1;
	return `${prefix}${String(next).padStart(3, "0")}`;
}

export function dedupeSlug(baseSlug: string, existingSlugs: string[]): string {
	const seen = new Set(existingSlugs);
	if (!seen.has(baseSlug)) return baseSlug;
	let i = 2;
	while (seen.has(`${baseSlug}-${i}`)) i += 1;
	return `${baseSlug}-${i}`;
}

function startsWithDir(rel: string, dir: string): boolean {
	return rel === dir || rel.startsWith(`${dir}${path.sep}`);
}

export function isProtectedPath(wikiRoot: string, absolutePath: string): boolean {
	const rel = path.relative(wikiRoot, absolutePath);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
	return startsWithDir(rel, "raw") || startsWithDir(rel, "meta");
}

export function isWikiPagePath(wikiRoot: string, absolutePath: string): boolean {
	const rel = path.relative(wikiRoot, absolutePath);
	if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
	return startsWithDir(rel, "pages");
}

export function normalizeWikiLink(target: string): string | undefined {
	const clean = target.trim().replace(/\\/g, "/").replace(/\.md$/i, "");
	const [pathTarget] = clean.split("#", 2);
	if (!pathTarget) return undefined;
	if (pathTarget.startsWith("sources/")) return `pages/${pathTarget}.md`;
	if (pathTarget.startsWith("pages/")) return `${pathTarget}.md`;
	return `pages/${pathTarget}.md`;
}

function isExternalLink(target: string): boolean {
	return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
}

export function normalizeMarkdownLink(fromPage: string, target: string): string | undefined {
	const clean = target.trim();
	if (!clean || clean.startsWith("#") || isExternalLink(clean)) return undefined;
	const [targetPath] = clean.split("#", 2);
	if (!targetPath) return undefined;

	const posix = path.posix;
	const fromDir = posix.dirname(fromPage.replace(/\\/g, "/"));
	const normalized = targetPath.startsWith("/")
		? posix.normalize(targetPath.replace(/^\/+/, ""))
		: posix.normalize(posix.join(fromDir, targetPath));

	if (!normalized || normalized.startsWith("../")) return undefined;
	if (normalized.endsWith(".md")) return normalized;
	if (!posix.extname(normalized)) return `${normalized}.md`;
	return normalized;
}

export function extractWikiLinks(markdown: string): string[] {
	const links: string[] = [];
	const regex = /\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g;
	for (const match of markdown.matchAll(regex)) {
		links.push(match[1].trim());
	}
	return links;
}

export function extractMarkdownLinks(markdown: string): string[] {
	const links: string[] = [];
	const regex = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
	for (const match of markdown.matchAll(regex)) {
		const target = match[1]?.trim();
		if (target) links.push(target);
	}
	return links;
}

export function extractHeadings(markdown: string): string[] {
	const headings: string[] = [];
	for (const match of markdown.matchAll(/^#{1,6}\s+(.+)$/gm)) {
		headings.push(match[1].trim());
	}
	return headings;
}

export function countWords(text: string): number {
	return text.trim().match(/\S+/g)?.length ?? 0;
}
