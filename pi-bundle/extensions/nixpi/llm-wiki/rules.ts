import type { RegistryEntry, WikiPageType } from "./types.ts";

export const KNOWLEDGE_TYPES = new Set<WikiPageType>(["concept", "entity", "synthesis", "analysis", "evolution", "procedure", "decision", "identity"]);
export const OPERATIONAL_TYPES = new Set<WikiPageType>(["task", "event", "reminder"]);

export const TASK_STATUSES = new Set(["open", "in-progress", "waiting", "done", "cancelled"]);
export const EVENT_STATUSES = new Set(["scheduled", "done", "cancelled"]);
export const REMINDER_STATUSES = new Set(["open", "snoozed", "done", "cancelled"]);
export const CANONICAL_STATUSES = new Set(["draft", "active", "contested", "superseded", "archived"]);

export const REQUIRED_FRONTMATTER_FIELDS: Record<WikiPageType, readonly string[]> = {
	source: ["type", "source_id", "title", "status", "captured_at", "origin_type", "origin_value", "source_ids"],
	concept:   ["type", "title", "status", "updated", "source_ids", "summary"],
	entity:    ["type", "title", "status", "updated", "source_ids", "summary"],
	synthesis: ["type", "title", "status", "updated", "source_ids", "summary"],
	analysis:  ["type", "title", "status", "updated", "source_ids", "summary"],
	evolution: ["type", "title", "status", "updated", "source_ids", "summary"],
	procedure: ["type", "title", "status", "updated", "source_ids", "summary"],
	decision:  ["type", "title", "status", "updated", "source_ids", "summary"],
	identity:  ["type", "title", "status", "updated", "source_ids", "summary"],
	journal:   ["type", "title", "status", "updated", "summary"],
	task:      ["type", "title", "status", "summary"],
	event:     ["type", "title", "status", "summary"],
	reminder:  ["type", "title", "status", "summary"],
};

export const SEARCH_FIELD_WEIGHTS = {
	exactTitle: 120,
	exactAlias: 110,
	exactDomain: 55,
	exactArea: 52,
	exactSummary: 50,
	exactSourceId: 45,
	exactPath: 40,
	exactHeading: 35,
	tokenTitle: 18,
	tokenAlias: 14,
	tokenDomain: 10,
	tokenArea: 10,
	tokenSummary: 8,
	tokenHeading: 6,
	tokenSourceId: 5,
	tokenTag: 4,
	tokenPath: 3,
} as const;

export type LintMode =
	| "links" | "orphans" | "frontmatter" | "duplicates"
	| "coverage" | "staleness" | "stale-reviews"
	| "empty-summary" | "duplicate-id" | "unresolved-ids"
	| "thin-content" | "crossref-gaps"
	| "contradiction-review" | "missing-concepts"
	| "all";

export interface SearchableRegistryEntry {
	title: RegistryEntry["title"];
	aliases: RegistryEntry["aliases"];
	domain: RegistryEntry["domain"];
	areas: RegistryEntry["areas"];
	summary: RegistryEntry["summary"];
	headings: RegistryEntry["headings"];
	tags: RegistryEntry["tags"];
	sourceIds: RegistryEntry["sourceIds"];
	path: RegistryEntry["path"];
}
