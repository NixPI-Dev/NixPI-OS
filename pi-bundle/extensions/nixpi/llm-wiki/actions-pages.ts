import { mkdirSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "./lib/filesystem.ts";
import { stringifyFrontmatter } from "./lib/frontmatter.ts";
import { err, nowIso, ok } from "./lib/core-utils.ts";
import { appendEvent, loadRegistry } from "./actions-meta.ts";
import {
	buildPagePath,
	dedupeSlug,
	getAllowedDomains,
	isDomainAllowed,
	normalizeAreas,
	normalizeDomain,
	normalizeHosts,
	normalizePageFolder,
	slugifyTitle,
	todayStamp,
} from "./paths.ts";
import type { ActionResult, CanonicalPageFrontmatter, CanonicalPageType, EnsurePageDetails } from "./types.ts";

// Review cycles in days for durable object types
const REVIEW_CYCLES: Record<string, number> = {
	project: 90, area: 90, person: 60, concept: 180,
	host: 60, service: 60, dashboard: 90, repository: 90,
};

function addDays(base: string, days: number): string {
	const d = new Date(`${base}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

interface EnsurePageParams {
	type: CanonicalPageType;
	title: string;
	objectType?: string;
	aliases?: string[];
	tags?: string[];
	hosts?: string[];
	domain?: string;
	areas?: string[];
	folder?: string;
	summary?: string;
}

export function handleEnsurePage(wikiRoot: string, params: EnsurePageParams): ActionResult<EnsurePageDetails> {
	const registry = loadRegistry(wikiRoot);
	const normalizedTitle = params.title.trim().toLowerCase();
	const normalizedAliases = new Set((params.aliases ?? []).map((alias) => alias.trim().toLowerCase()));
	const normalizedDomain = normalizeDomain(params.domain);

	const allowedDomains = getAllowedDomains();
	if (!isDomainAllowed(normalizedDomain, allowedDomains)) {
		return err(
			`Domain "${normalizedDomain ?? "unspecified"}" is not accessible in this session. ` +
				`Allowed domains: ${allowedDomains?.join(", ") ?? "all"}.`,
		);
	}

	const normalizedFolder =
		normalizePageFolder(params.folder) ??
		(params.type === "journal"  ? "journal/daily" :
		 params.type === "task"     ? "planner/tasks" :
		 params.type === "event"    ? "planner/calendar" :
		 params.type === "reminder" ? "planner/reminders" :
		 normalizedDomain);

	const matches = registry.pages.filter((page) => {
		if (page.type !== params.type) return false;
		if (normalizedDomain && page.domain !== normalizedDomain) return false;
		if (normalizedFolder && page.folder !== normalizedFolder) return false;
		const names = [page.title, ...page.aliases].map((value) => value.trim().toLowerCase());
		return names.includes(normalizedTitle) || [...normalizedAliases].some((alias) => names.includes(alias));
	});

	if (matches.length > 1) {
		return ok({
			text: `Conflict: ${matches.length} pages matched "${params.title}". Candidates: ${matches.map((page) => page.path).join(", ")}`,
			details: {
				resolved: false,
				created: false,
				conflict: true,
				candidates: matches.map((page) => ({ path: page.path, title: page.title })),
			},
		});
	}

	if (matches.length === 1 && matches[0]) {
		const page = matches[0];
		return ok({
			text: `Resolved existing page: ${page.path}`,
			details: { resolved: true, created: false, conflict: false, path: page.path, title: page.title, type: page.type },
		});
	}

	const existingSlugs = registry.pages
		.filter((page) => page.type === params.type)
		.filter((page) => !normalizedFolder || page.folder === normalizedFolder)
		.map((page) => path.basename(page.path, ".md"));
	const today = todayStamp();
	const slug = dedupeSlug(slugifyTitle(params.title), existingSlugs);
	const objectType = params.objectType ?? params.type;
	const idPrefix = objectType;
	const id = params.type === "journal" ? `journal/${params.title}` : `${idPrefix}/${slug}`;
	const reviewDays = REVIEW_CYCLES[objectType ?? ""];
	const relPath = buildPagePath(slug, normalizedFolder);
	const absPath = path.join(wikiRoot, relPath);

	const fm: CanonicalPageFrontmatter = {
		id,
		schema_version: 1,
		type: params.type,
		object_type: objectType,
		title: params.title,
		aliases: params.aliases ?? [],
		tags: params.tags ?? [],
		hosts: normalizeHosts(params.hosts),
		...(normalizedDomain ? { domain: normalizedDomain } : {}),
		areas: normalizeAreas(params.areas),
		status:
			params.type === "journal"  ? "active"    :
			params.type === "task"     ? "open"      :
			params.type === "event"    ? "scheduled" :
			params.type === "reminder" ? "open"      :
			"draft",
		validation_level: "seed",
		created: today,
		updated: today,
		...(reviewDays ? { review_cycle_days: reviewDays, last_reviewed: today, next_review: addDays(today, reviewDays) } : {}),
		// task extras
		...(params.type === "task" ? { priority: "medium", due: "", schedule: "", depends_on: [], blocked_by: [], completed: "" } : {}),
		// event extras
		...(params.type === "event" ? { start: "", end: "", location: "", attendees: [], completed: "" } : {}),
		// reminder extras
		...(params.type === "reminder" ? { remind_at: "", snooze_until: "", for: "", completed: "" } : {}),
		projects: [],
		people: [],
		systems: [],
		sources: [],
		related: [],
		source_ids: [],
		summary: params.summary ?? `Working note for ${params.title}.`,
	};
	const body = (
		params.type === "journal" ? [
			`# ${params.title}`, "",
			"## Focus", "",
			"## Calendar", "",
			"## Log", "",
			"## Wins", "",
			"## Friction / lessons", "",
			"## Tomorrow", "",
			"## Follow-ups", "",
		] :
		params.type === "task" ? [
			`# ${params.title}`, "",
			"## Outcome", "",
			"## Next action", "",
			"## Notes", "",
			"## Related", "",
		] :
		params.type === "event" ? [
			`# ${params.title}`, "",
			"## Purpose", "",
			"## Agenda / notes", "",
			"## Decisions", "",
			"## Follow-ups", "",
			"## Related", "",
		] :
		params.type === "reminder" ? [
			`# ${params.title}`, "",
			"## Context", "",
			"## What to do", "",
			"## Related", "",
		] :
		[
			`# ${params.title}`, "",
			"## Current understanding", "",
			"## Evidence", "",
			"## Tensions / caveats", "",
			"## Open questions", "",
			"## Related pages", "",
		]
	).join("\n");

	mkdirSync(path.dirname(absPath), { recursive: true });
	atomicWriteFile(absPath, stringifyFrontmatter(fm, body));

	appendEvent(wikiRoot, {
		ts: nowIso(),
		kind: "page-create",
		title: `Created ${params.type}: ${params.title}`,
		pagePaths: [relPath],
	});

	return ok({
		text: `Created page: ${relPath}`,
		details: { resolved: true, created: true, conflict: false, path: relPath, title: params.title, type: params.type },
	});
}
