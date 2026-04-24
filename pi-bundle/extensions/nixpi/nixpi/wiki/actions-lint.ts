import { execFileSync } from "node:child_process";
import path from "node:path";
import { atomicWriteFile } from "./lib/filesystem.ts";
import { ok } from "./lib/core-utils.ts";
import { buildBacklinks, buildRegistry, scanPages } from "./actions-meta.ts";
import { extractMarkdownLinks, normalizeDomain, normalizeMarkdownLink, normalizeWikiLink, todayStamp } from "./paths.ts";
import { PAGE_TYPES, type WikiPageType } from "./types.ts";
import {
	type LintMode,
	REQUIRED_FRONTMATTER_FIELDS,
	CANONICAL_STATUSES,
	TASK_STATUSES,
	EVENT_STATUSES,
	REMINDER_STATUSES,
	OPERATIONAL_TYPES,
	KNOWLEDGE_TYPES,
} from "./rules.ts";
import type { ActionResult, BacklinksData, LintDetails, LintIssue, RegistryData } from "./types.ts";

const SOURCE_STATUSES = new Set(["captured", "integrated", "superseded"]);
const ORIGIN_TYPES = new Set(["text", "file", "url"]);
const VALIDATION_LEVELS = new Set(["seed", "working", "trusted", "superseded"]);
const RELATION_FIELDS = ["projects", "people", "systems", "sources", "related", "depends_on", "blocked_by"] as const;
const THIN_CONTENT_WORD_THRESHOLD = 25;
const CROSSFREF_MENTION_THRESHOLD = 2;
const MISSING_CONCEPT_MENTION_THRESHOLD = 2;
const QMD_COLLECTION = process.env.PI_LLM_WIKI_QMD_COLLECTION ?? "wiki";

function normalizeHeadingRef(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhrase(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function tokenizeForSimilarity(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 3);
}

function overlapCount(a: string[], b: string[]): number {
	const bSet = new Set(b);
	return [...new Set(a)].filter((token) => bSet.has(token)).length;
}

function normalizeCandidatePhrase(value: string): string {
	return value.trim().replace(/^(?:The|A|An)\s+/, "");
}

function extractCandidatePhrases(text: string): string[] {
	const matches = text.match(/\b(?:[A-Z][a-z0-9]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z0-9]+|[A-Z]{2,})){1,3}\b/g) ?? [];
	const phrases = new Set<string>();

	for (const match of matches) {
		const normalized = normalizeCandidatePhrase(match);
		if (normalized.length >= 6) phrases.add(normalized);

		const tokens = normalized.split(/\s+/).filter(Boolean);
		for (let size = 2; size <= Math.min(3, tokens.length); size += 1) {
			for (let start = 0; start <= tokens.length - size; start += 1) {
				const subphrase = tokens.slice(start, start + size).join(" ");
				if (subphrase.length >= 6) phrases.add(subphrase);
			}
		}
	}

	return [...phrases];
}

function getQmdBin(): string {
	return process.env.PI_LLM_WIKI_QMD_BIN ?? "qmd";
}

function queryQmdFiles(phrase: string): string[] | undefined {
	for (const query of [phrase, `"${phrase}"`]) {
		try {
			const stdout = execFileSync(getQmdBin(), ["search", query, "-c", QMD_COLLECTION, "--files", "-n", "20"], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			const files = stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.filter((line) => line.endsWith(".md"));
			if (files.length > 0) return files;
		} catch {
			// Try the next query variant before falling back to the local heuristic.
		}
	}
	return undefined;
}

function lintLinks(pages: ReturnType<typeof scanPages>, registry: RegistryData): LintIssue[] {
	const known = new Set(registry.pages.map((page) => page.path));
	const headingsByPath = new Map(
		pages.map((page) => [page.relativePath, new Set(page.headings.map((heading) => normalizeHeadingRef(heading)))]),
	);
	const issues: LintIssue[] = [];
	for (const page of pages) {
		for (const raw of page.rawLinks) {
			const normalized = normalizeWikiLink(raw);
			if (!normalized || !known.has(normalized)) {
				issues.push({
					kind: "broken-link",
					severity: "warning",
					path: page.relativePath,
					message: `Broken link: [[${raw}]]`,
				});
				continue;
			}
			const [, fragment] = raw.split("#", 2);
			if (fragment) {
				const headings = headingsByPath.get(normalized);
				if (!headings?.has(normalizeHeadingRef(fragment))) {
					issues.push({
						kind: "broken-link",
						severity: "warning",
						path: page.relativePath,
						message: `Broken heading link: [[${raw}]]`,
					});
				}
			}
		}

		for (const raw of extractMarkdownLinks(page.body)) {
			const normalized = normalizeMarkdownLink(page.relativePath, raw);
			if (!normalized) continue;
			if (!known.has(normalized)) {
				issues.push({
					kind: "broken-link",
					severity: "warning",
					path: page.relativePath,
					message: `Broken markdown link: (${raw})`,
				});
				continue;
			}
			const [, fragment] = raw.split("#", 2);
			if (fragment) {
				const headings = headingsByPath.get(normalized);
				if (!headings?.has(normalizeHeadingRef(fragment))) {
					issues.push({
						kind: "broken-link",
						severity: "warning",
						path: page.relativePath,
						message: `Broken markdown heading link: (${raw})`,
					});
				}
			}
		}
	}
	return issues;
}

function lintOrphans(registry: RegistryData, backlinks: BacklinksData): LintIssue[] {
	return registry.pages
		.filter((page) => page.type !== "source")
		.filter((page) => {
			const record = backlinks.byPath[page.path];
			return record && record.inbound.length === 0 && record.outbound.length === 0;
		})
		.map((page) => ({
			kind: "orphan",
			severity: "warning" as const,
			path: page.path,
			message: "No inbound or outbound wiki links.",
		}));
}

function pushFrontmatterIssue(issues: LintIssue[], pathValue: string, message: string): void {
	issues.push({
		kind: "frontmatter",
		severity: "error",
		path: pathValue,
		message,
	});
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

function lintFrontmatter(pages: ReturnType<typeof scanPages>): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const page of pages) {
		const rawType = page.frontmatter.type;
		if (typeof rawType !== "string") {
			pushFrontmatterIssue(issues, page.relativePath, "Missing: type");
			continue;
		}
		if (!PAGE_TYPES.includes(rawType as WikiPageType)) {
			pushFrontmatterIssue(issues, page.relativePath, `Invalid type: ${rawType}`);
			continue;
		}

		const type = rawType as WikiPageType;
		const required = REQUIRED_FRONTMATTER_FIELDS[type];
		for (const field of required) {
			if (!(field in page.frontmatter)) {
				pushFrontmatterIssue(issues, page.relativePath, `Missing: ${field}`);
			}
		}

		const title = page.frontmatter.title;
		if (title !== undefined && !isNonEmptyString(title)) {
			pushFrontmatterIssue(issues, page.relativePath, "Field title must be a non-empty string.");
		}

		const domain = page.frontmatter.domain;
		if (domain !== undefined && (typeof domain !== "string" || normalizeDomain(domain) !== domain.trim().toLowerCase())) {
			pushFrontmatterIssue(issues, page.relativePath, `Invalid domain: ${String(domain)}`);
		}

		for (const field of ["aliases", "tags", "hosts", "areas", "source_ids", "integration_targets", ...RELATION_FIELDS] as const) {
			const value = page.frontmatter[field];
			if (value !== undefined && !isStringArray(value)) {
				pushFrontmatterIssue(issues, page.relativePath, `Field ${field} must be an array of strings.`);
			}
		}

		if (type === "source") {
			const sourceId = page.frontmatter.source_id;
			if (sourceId !== undefined && !isNonEmptyString(sourceId)) {
				pushFrontmatterIssue(issues, page.relativePath, "Field source_id must be a non-empty string.");
			}
			const status = page.frontmatter.status;
			if (status !== undefined && (typeof status !== "string" || !SOURCE_STATUSES.has(status))) {
				pushFrontmatterIssue(issues, page.relativePath, `Invalid source status: ${String(status)}`);
			}
			const originType = page.frontmatter.origin_type;
			if (originType !== undefined && (typeof originType !== "string" || !ORIGIN_TYPES.has(originType))) {
				pushFrontmatterIssue(issues, page.relativePath, `Invalid origin_type: ${String(originType)}`);
			}
			const capturedAt = page.frontmatter.captured_at;
			if (capturedAt !== undefined && !isNonEmptyString(capturedAt)) {
				pushFrontmatterIssue(issues, page.relativePath, "Field captured_at must be a non-empty string.");
			}
			const originValue = page.frontmatter.origin_value;
			if (originValue !== undefined && !isNonEmptyString(originValue)) {
				pushFrontmatterIssue(issues, page.relativePath, "Field origin_value must be a non-empty string.");
			}
			if (status === "integrated") {
				const integratedAt = page.frontmatter.integrated_at;
				if (integratedAt !== undefined && !isNonEmptyString(integratedAt)) {
					pushFrontmatterIssue(issues, page.relativePath, "Field integrated_at must be a non-empty string.");
				}
				const summary = page.frontmatter.summary;
				if (!isNonEmptyString(summary)) {
					pushFrontmatterIssue(issues, page.relativePath, "Integrated sources require a non-empty summary.");
				}
				const targets = page.frontmatter.integration_targets;
				if (!Array.isArray(targets) || targets.length === 0) {
					pushFrontmatterIssue(issues, page.relativePath, "Integrated sources require integration_targets.");
				}
			}
			continue;
		}

		const status = page.frontmatter.status;
		if (status !== undefined && typeof status === "string") {
			const validStatuses =
				type === "task" ? TASK_STATUSES :
				type === "event" ? EVENT_STATUSES :
				type === "reminder" ? REMINDER_STATUSES :
				CANONICAL_STATUSES;
			if (!validStatuses.has(status)) {
				pushFrontmatterIssue(issues, page.relativePath, `Invalid status "${status}" for type "${type}"`);
			}
		}

		const updated = page.frontmatter.updated;
		if (updated !== undefined && !isNonEmptyString(updated)) {
			pushFrontmatterIssue(issues, page.relativePath, "Field updated must be a non-empty string.");
		}

		const summary = page.frontmatter.summary;
		if (summary !== undefined && typeof summary !== "string") {
			pushFrontmatterIssue(issues, page.relativePath, "Field summary must be a string.");
		}
		if (summary !== undefined && typeof summary === "string" && summary.trim() === "") {
			pushFrontmatterIssue(issues, page.relativePath, "Field summary must be a non-empty string.");
		}

		const id = page.frontmatter.id;
		if (id !== undefined) {
			if (!isNonEmptyString(id)) {
				pushFrontmatterIssue(issues, page.relativePath, "Field id must be a non-empty string.");
			} else if (!id.includes("/") || /\s/.test(id)) {
				pushFrontmatterIssue(issues, page.relativePath, `Invalid id format: ${id}`);
			}
		}

		const objectType = page.frontmatter.object_type;
		if (objectType !== undefined && !isNonEmptyString(objectType)) {
			pushFrontmatterIssue(issues, page.relativePath, "Field object_type must be a non-empty string.");
		}
		if (id !== undefined && typeof id === "string" && objectType !== undefined && typeof objectType === "string") {
			const [prefix] = id.split("/", 1);
			if (prefix && prefix !== objectType) {
				pushFrontmatterIssue(issues, page.relativePath, `id prefix \"${prefix}\" does not match object_type \"${objectType}\".`);
			}
		}

		const schemaVersion = page.frontmatter.schema_version;
		if (schemaVersion !== undefined && schemaVersion !== 1) {
			pushFrontmatterIssue(issues, page.relativePath, `Unsupported schema_version: ${String(schemaVersion)}`);
		}

		const validationLevel = page.frontmatter.validation_level;
		if (validationLevel !== undefined && (typeof validationLevel !== "string" || !VALIDATION_LEVELS.has(validationLevel))) {
			pushFrontmatterIssue(issues, page.relativePath, `Invalid validation_level: ${String(validationLevel)}`);
		}
	}
	return issues;
}

function lintDuplicates(registry: RegistryData): LintIssue[] {
	const seen = new Map<string, string>();
	const issues: LintIssue[] = [];
	for (const page of registry.pages.filter((entry) => entry.type !== "source")) {
		const normalizedTitle = page.title.trim().toLowerCase();
		const key = `${page.type}:${page.domain ?? "global"}:${normalizedTitle}`;
		const previousPath = seen.get(key);
		if (previousPath) {
			issues.push({
				kind: "duplicate",
				severity: "warning",
				path: page.path,
				message: `Duplicate title with ${previousPath}`,
			});
			continue;
		}
		seen.set(key, page.path);
	}
	return issues;
}

function lintCoverage(pages: ReturnType<typeof scanPages>, registry: RegistryData, _backlinks: BacklinksData): LintIssue[] {
	const issues: LintIssue[] = [];
	const pageByPath = new Map(pages.map((page) => [page.relativePath, page]));
	for (const page of registry.pages) {
		if (page.type === "source") {
			const sourceId = page.sourceIds[0];
			const citingPages = sourceId
				? registry.pages.filter((entry) => entry.type !== "source" && entry.sourceIds.includes(sourceId))
				: [];
			if (citingPages.length === 0) {
				issues.push({
					kind: "coverage",
					severity: "info",
					path: page.path,
					message: "Source not cited by any canonical page via source_ids.",
				});
			}

			const sourcePage = pageByPath.get(page.path);
			const status = sourcePage?.frontmatter.status;
			const integrationTargets = Array.isArray(sourcePage?.frontmatter.integration_targets)
				? sourcePage?.frontmatter.integration_targets.filter((value): value is string => typeof value === "string" && value.trim() !== "")
				: [];
			if (status === "integrated") {
				for (const rawTarget of integrationTargets) {
					const normalizedTarget = rawTarget.trim().replace(/\\/g, "/").replace(/^\/+/, "");
					const targetPath = normalizedTarget.startsWith("pages/")
						? normalizedTarget
						: normalizedTarget.endsWith(".md")
							? `pages/${normalizedTarget}`
							: `pages/${normalizedTarget}.md`;
					const targetPage = registry.pages.find((entry) => entry.path === targetPath);
					if (!targetPage) {
						issues.push({
							kind: "coverage",
							severity: "warning",
							path: page.path,
							message: `integration target missing: ${rawTarget}`,
						});
						continue;
					}
					if (targetPage.type === "source") {
						issues.push({
							kind: "coverage",
							severity: "warning",
							path: page.path,
							message: `integration target cannot be a source page: ${rawTarget}`,
						});
						continue;
					}
					if (sourceId && !targetPage.sourceIds.includes(sourceId)) {
						issues.push({
							kind: "coverage",
							severity: "warning",
							path: page.path,
							message: `integration target missing source_ids reference: ${targetPath}`,
						});
					}
				}
			}
			continue;
		}

		if (page.type === "journal") continue;
		if (OPERATIONAL_TYPES.has(page.type)) continue;

		if (page.sourceIds.length === 0) {
			issues.push({
				kind: "coverage",
				severity: "warning",
				path: page.path,
				message: "No source_ids listed.",
			});
		}
	}
	return issues;
}

function lintStaleness(registry: RegistryData): LintIssue[] {
	return registry.pages
		.filter((page) => page.type === "source" && page.status === "captured")
		.map((page) => ({
			kind: "staleness",
			severity: "info" as const,
			path: page.path,
			message: "Source still in captured state.",
		}));
}

function lintStaleReviews(registry: RegistryData): LintIssue[] {
	const today = todayStamp();
	return registry.pages
		.filter((page) => !!page.nextReview)
		.filter((page) => page.status !== "done" && page.status !== "cancelled" && page.status !== "archived")
		.filter((page) => (page.nextReview ?? "") < today)
		.map((page) => ({
			kind: "stale-review",
			severity: "info" as const,
			path: page.path,
			message: `Review overdue since ${page.nextReview}.`,
		}));
}

function lintEmptySummary(registry: RegistryData): LintIssue[] {
	return registry.pages
		.filter((page) => page.type !== "source")
		.filter((page) => page.summary.trim() === "")
		.map((page) => ({
			kind: "empty-summary",
			severity: "warning" as const,
			path: page.path,
			message: "Summary is empty.",
		}));
}

function lintDuplicateIds(registry: RegistryData): LintIssue[] {
	const seen = new Map<string, string>();
	const issues: LintIssue[] = [];
	for (const page of registry.pages) {
		if (!page.id) continue;
		const previousPath = seen.get(page.id);
		if (previousPath) {
			issues.push({
				kind: "duplicate-id",
				severity: "error",
				path: page.path,
				message: `Duplicate id \"${page.id}\" also used by ${previousPath}`,
			});
			continue;
		}
		seen.set(page.id, page.path);
	}
	return issues;
}

function lintUnresolvedIds(pages: ReturnType<typeof scanPages>, registry: RegistryData): LintIssue[] {
	const knownIds = new Set(registry.pages.map((page) => page.id).filter((id): id is string => typeof id === "string" && id.trim() !== ""));
	const issues: LintIssue[] = [];
	for (const page of pages) {
		for (const field of RELATION_FIELDS) {
			const values = page.frontmatter[field];
			if (!Array.isArray(values)) continue;
			for (const value of values) {
				if (typeof value !== "string" || value.trim() === "") continue;
				if (!knownIds.has(value)) {
					issues.push({
						kind: "unresolved-id",
						severity: "warning",
						path: page.relativePath,
						message: `Unresolved relation in ${field}: ${value}`,
					});
				}
			}
		}
	}
	return issues;
}

function lintThinContent(registry: RegistryData): LintIssue[] {
	return registry.pages
		.filter((page) => KNOWLEDGE_TYPES.has(page.type))
		.filter((page) => page.status !== "archived" && page.status !== "superseded")
		.filter((page) => page.wordCount < THIN_CONTENT_WORD_THRESHOLD)
		.map((page) => ({
			kind: "thin-content",
			severity: "info" as const,
			path: page.path,
			message: `Thin content: ${page.wordCount} words (< ${THIN_CONTENT_WORD_THRESHOLD}).`,
		}));
}

function getExplicitMarkdownTargets(page: ReturnType<typeof scanPages>[number]): string[] {
	return extractMarkdownLinks(page.body)
		.map((raw) => normalizeMarkdownLink(page.relativePath, raw))
		.filter((value): value is string => !!value);
}

function lintCrossrefGaps(pages: ReturnType<typeof scanPages>, registry: RegistryData): LintIssue[] {
	const issues: LintIssue[] = [];
	const explicitMarkdownTargets = new Map(pages.map((page) => [page.relativePath, new Set(getExplicitMarkdownTargets(page))]));
	for (const target of registry.pages) {
		if (target.type === "source" || target.type === "journal" || OPERATIONAL_TYPES.has(target.type)) continue;
		const candidateNames = [target.title, ...target.aliases]
			.map((value) => value.trim())
			.filter((value) => value.length >= 5);
		if (candidateNames.length === 0) continue;

		let mentions = 0;
		for (const page of pages) {
			if (page.relativePath === target.path) continue;
			if (page.normalizedLinks.includes(target.path)) continue;
			if (explicitMarkdownTargets.get(page.relativePath)?.has(target.path)) continue;
			const body = page.body;
			const mentioned = candidateNames.some((name) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`, "i").test(body));
			if (mentioned) mentions += 1;
		}

		if (mentions >= CROSSFREF_MENTION_THRESHOLD) {
			issues.push({
				kind: "crossref-gap",
				severity: "info",
				path: target.path,
				message: `Referenced in ${mentions} page(s) without explicit links. Consider adding direct links or backlinks.`,
			});
		}
	}
	return issues;
}

function lintContradictionReview(pages: ReturnType<typeof scanPages>, registry: RegistryData): LintIssue[] {
	const issues: LintIssue[] = [];
	const explicitMarkdownTargets = new Map(pages.map((page) => [page.relativePath, new Set(getExplicitMarkdownTargets(page))]));
	const candidates = registry.pages.filter((page) => KNOWLEDGE_TYPES.has(page.type));
	for (let i = 0; i < candidates.length; i += 1) {
		const left = candidates[i];
		for (let j = i + 1; j < candidates.length; j += 1) {
			const right = candidates[j];
			if (left.path === right.path) continue;
			if ((left.domain ?? "") !== (right.domain ?? "")) continue;
			const linkedLeft = left.linksOut.includes(right.path) || explicitMarkdownTargets.get(left.path)?.has(right.path);
			const linkedRight = right.linksOut.includes(left.path) || explicitMarkdownTargets.get(right.path)?.has(left.path);
			if (linkedLeft || linkedRight) continue;
			const sameAreas = left.areas.some((area) => right.areas.includes(area));
			const sameSources = left.sourceIds.some((sourceId) => right.sourceIds.includes(sourceId));
			const tokenOverlap = overlapCount(tokenizeForSimilarity(left.title), tokenizeForSimilarity(right.title));
			const sameObjectType = !!left.objectType && left.objectType === right.objectType;
			if (!(sameSources || (sameAreas && tokenOverlap >= 1) || (sameObjectType && tokenOverlap >= 2))) continue;
			if (!left.summary.trim() || !right.summary.trim()) continue;
			if (normalizePhrase(left.summary) === normalizePhrase(right.summary)) continue;
			if (left.status === right.status && tokenOverlap === 0 && !sameSources) continue;
			issues.push({
				kind: "contradiction-review",
				severity: "info",
				path: left.path,
				message: `Review against ${right.path}: overlapping context but divergent summaries/status (${left.status} vs ${right.status}).`,
			});
		}
	}
	return issues;
}

function collectLocalPhraseMentions(pages: ReturnType<typeof scanPages>): Map<string, string[]> {
	const mentions = new Map<string, Set<string>>();
	for (const page of pages) {
		for (const phrase of extractCandidatePhrases(`${page.body}\n${page.headings.join("\n")}`)) {
			const normalized = normalizePhrase(phrase);
			if (!mentions.has(normalized)) mentions.set(normalized, new Set());
			mentions.get(normalized)?.add(page.relativePath);
		}
	}
	return new Map([...mentions.entries()].map(([phrase, paths]) => [phrase, [...paths].sort()]));
}

function lintMissingConcepts(pages: ReturnType<typeof scanPages>, registry: RegistryData): LintIssue[] {
	const existingNames = new Set(
		registry.pages.flatMap((page) => [page.title, ...page.aliases]).map(normalizePhrase).filter(Boolean),
	);
	const localMentions = collectLocalPhraseMentions(pages);
	const repeatedMentions = [...localMentions.entries()].filter(([, mentionPaths]) => mentionPaths.length >= MISSING_CONCEPT_MENTION_THRESHOLD);
	const issues: LintIssue[] = [];

	for (const [phrase, mentionPaths] of repeatedMentions) {
		if (existingNames.has(phrase)) continue;

		const phraseTokens = phrase.split(" ").filter(Boolean);
		const coveredByMoreSpecificPhrase = repeatedMentions.some(([otherPhrase, otherPaths]) => {
			if (otherPhrase === phrase) return false;
			if (otherPaths.length !== mentionPaths.length) return false;
			if (otherPhrase.split(" ").length <= phraseTokens.length) return false;
			if (!otherPhrase.includes(phrase)) return false;
			return otherPaths.every((pathValue, index) => pathValue === mentionPaths[index]);
		});
		if (coveredByMoreSpecificPhrase) continue;

		const qmdFiles = queryQmdFiles(phrase);
		const confirmedPaths = qmdFiles ? [...new Set(qmdFiles)] : mentionPaths;
		if (confirmedPaths.length < MISSING_CONCEPT_MENTION_THRESHOLD) continue;
		issues.push({
			kind: "missing-concept",
			severity: "info",
			path: mentionPaths[0] ?? "pages",
			message:
				`Missing concept candidate: "${phrase}" appears in ${confirmedPaths.length} page(s)` +
				`${qmdFiles ? " (confirmed by qmd)" : " (local heuristic)"}. Consider creating a page.`,
		});
	}
	return issues;
}

function buildCounts(issues: LintIssue[]) {
	return {
		total: issues.length,
		brokenLinks: issues.filter((issue) => issue.kind === "broken-link").length,
		orphans: issues.filter((issue) => issue.kind === "orphan").length,
		frontmatter: issues.filter((issue) => issue.kind === "frontmatter").length,
		duplicates: issues.filter((issue) => issue.kind === "duplicate").length,
		coverage: issues.filter((issue) => issue.kind === "coverage").length,
		staleness: issues.filter((issue) => issue.kind === "staleness").length,
		staleReviews: issues.filter((issue) => issue.kind === "stale-review").length,
		emptySummary: issues.filter((issue) => issue.kind === "empty-summary").length,
		duplicateIds: issues.filter((issue) => issue.kind === "duplicate-id").length,
		unresolvedIds: issues.filter((issue) => issue.kind === "unresolved-id").length,
		thinContent: issues.filter((issue) => issue.kind === "thin-content").length,
		crossrefGaps: issues.filter((issue) => issue.kind === "crossref-gap").length,
		contradictionReview: issues.filter((issue) => issue.kind === "contradiction-review").length,
		missingConcepts: issues.filter((issue) => issue.kind === "missing-concept").length,
	};
}

function renderReport(mode: string, issues: LintIssue[], counts: ReturnType<typeof buildCounts>): string {
	const lines = ["# Lint Report", "", `Mode: ${mode}`, `Total: ${counts.total}`, ""];
	for (const issue of issues) {
		lines.push(`- **${issue.severity}** [${issue.kind}] \`${issue.path}\` - ${issue.message}`);
	}
	lines.push("");
	return lines.join("\n");
}

const LINT_CHECKS: Record<
	Exclude<LintMode, "all">,
	(pages: ReturnType<typeof scanPages>, registry: RegistryData, backlinks: BacklinksData) => LintIssue[]
> = {
	links: (pages, registry) => lintLinks(pages, registry),
	orphans: (_pages, registry, backlinks) => lintOrphans(registry, backlinks),
	frontmatter: (pages) => lintFrontmatter(pages),
	duplicates: (_pages, registry) => lintDuplicates(registry),
	coverage: (pages, registry, backlinks) => lintCoverage(pages, registry, backlinks),
	staleness: (_pages, registry) => lintStaleness(registry),
	"stale-reviews": (_pages, registry) => lintStaleReviews(registry),
	"empty-summary": (_pages, registry) => lintEmptySummary(registry),
	"duplicate-id": (_pages, registry) => lintDuplicateIds(registry),
	"unresolved-ids": (pages, registry) => lintUnresolvedIds(pages, registry),
	"thin-content": (_pages, registry) => lintThinContent(registry),
	"crossref-gaps": (pages, registry) => lintCrossrefGaps(pages, registry),
	"contradiction-review": (pages, registry) => lintContradictionReview(pages, registry),
	"missing-concepts": (pages, registry) => lintMissingConcepts(pages, registry),
};

export function handleWikiLint(wikiRoot: string, mode: LintMode = "all"): ActionResult<LintDetails> {
	const pages = scanPages(wikiRoot);
	const registry = buildRegistry(pages);
	const backlinks = buildBacklinks(registry);
	const selectedModes = mode === "all" ? (Object.keys(LINT_CHECKS) as Array<Exclude<LintMode, "all">>) : [mode];
	const issues = selectedModes.flatMap((selectedMode) => LINT_CHECKS[selectedMode](pages, registry, backlinks));

	const counts = buildCounts(issues);
	atomicWriteFile(path.join(wikiRoot, "meta", "lint-report.md"), renderReport(mode, issues, counts));

	return ok({
		text:
			`Lint: ${counts.total} issues ` +
			`(links=${counts.brokenLinks} orphans=${counts.orphans} fm=${counts.frontmatter} ` +
			`dup=${counts.duplicates} cov=${counts.coverage} stale=${counts.staleness} ` +
			`review=${counts.staleReviews} summary=${counts.emptySummary} ` +
			`dupId=${counts.duplicateIds} unresolved=${counts.unresolvedIds} ` +
			`thin=${counts.thinContent} crossref=${counts.crossrefGaps} ` +
			`contra=${counts.contradictionReview} missing=${counts.missingConcepts})`,
		details: { counts, issues },
	});
}
