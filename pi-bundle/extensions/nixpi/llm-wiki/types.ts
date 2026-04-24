import type { ActionResult as SharedActionResult } from "./lib/core-utils.ts";

export type ActionResult<TDetails extends object = Record<string, unknown>> = SharedActionResult<TDetails>;

export const PAGE_TYPES = [
	"source",
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
	"identity",
	"journal",
	"task",
	"event",
	"reminder",
] as const;
export type WikiPageType = (typeof PAGE_TYPES)[number];

export const CANONICAL_PAGE_TYPES = [
	"concept",
	"entity",
	"synthesis",
	"analysis",
	"evolution",
	"procedure",
	"decision",
	"identity",
	"journal",
	"task",
	"event",
	"reminder",
] as const;
export type CanonicalPageType = (typeof CANONICAL_PAGE_TYPES)[number];

export interface SourceManifest {
	version: number;
	sourceId: string;
	title: string;
	kind: string;
	origin: { type: "url" | "file" | "text"; value: string };
	capturedAt: string;
	integratedAt?: string;
	hash: string;
	status: "captured" | "integrated" | "superseded";
}

export interface SourcePageFrontmatter {
	type: "source";
	source_id: string;
	title: string;
	kind: string;
	status: "captured" | "integrated" | "superseded";
	captured_at: string;
	integrated_at?: string;
	origin_type: "text" | "file" | "url";
	origin_value: string;
	aliases: string[];
	tags: string[];
	hosts: string[];
	domain?: string;
	areas: string[];
	validation_level?: string;
	source_ids: string[];
	integration_targets: string[];
	summary: string;
}

export interface CanonicalPageFrontmatter {
	type: CanonicalPageType;
	title: string;
	aliases: string[];
	tags: string[];
	hosts: string[];
	domain?: string;
	areas: string[];
	status: string;
	updated: string;
	source_ids: string[];
	summary: string;
	// object-model fields
	id?: string;
	schema_version?: number;
	object_type?: string;
	validation_level?: string;
	created?: string;
	review_cycle_days?: number;
	last_reviewed?: string;
	next_review?: string;
	// relation fields
	projects?: string[];
	people?: string[];
	systems?: string[];
	related?: string[];
	sources?: string[];
	depends_on?: string[];
	blocked_by?: string[];
	completed?: string;
	// task-specific
	priority?: string;
	due?: string;
	scheduled?: string;
	schedule?: string;
	// event/meeting-specific
	start?: string;
	end?: string;
	location?: string;
	attendees?: string[];
	// reminder-specific
	remind_at?: string;
	snooze_until?: string;
	for?: string;
}

export type WikiFrontmatter = SourcePageFrontmatter | CanonicalPageFrontmatter;

export interface RegistryEntry {
	type: WikiPageType;
	path: string;
	folder: string;
	title: string;
	aliases: string[];
	summary: string;
	status:
		| "draft" | "active" | "contested" | "superseded" | "archived"
		| "captured" | "integrated"
		| "open" | "in-progress" | "waiting" | "done" | "cancelled"
		| "scheduled" | "snoozed";
	tags: string[];
	hosts: string[];
	domain?: string;
	areas: string[];
	updated: string;
	sourceIds: string[];
	linksOut: string[];
	headings: string[];
	wordCount: number;
	// object-model fields
	id?: string;
	objectType?: string;
	schemaVersion?: number;
	validationLevel?: string;
	reviewCycleDays?: number;
	nextReview?: string;
	// planner fields
	due?: string;
	startDate?: string;
	remindAt?: string;
	schedule?: string;
}

export interface RegistryData {
	version: number;
	generatedAt: string;
	pages: RegistryEntry[];
}

export interface WikiMetaArtifacts {
	registry: RegistryData;
	backlinks: BacklinksData;
	index: string;
	log: string;
}

export interface BacklinksData {
	version: number;
	generatedAt: string;
	byPath: Record<string, { inbound: string[]; outbound: string[] }>;
}

export interface WikiEvent {
	ts: string;
	kind: "capture" | "integrate" | "page-create" | "lint" | "rebuild";
	title: string;
	sourceIds?: string[];
	pagePaths?: string[];
}

export interface LintIssue {
	kind: string;
	severity: "info" | "warning" | "error";
	path: string;
	message: string;
}

export interface LintRun {
	mode: string;
	counts: {
		total: number;
		brokenLinks: number;
		orphans: number;
		frontmatter: number;
		duplicates: number;
		coverage: number;
		staleness: number;
		staleReviews: number;
		emptySummary: number;
		duplicateIds: number;
		unresolvedIds: number;
		thinContent: number;
		crossrefGaps: number;
		contradictionReview: number;
		missingConcepts: number;
	};
	issues: LintIssue[];
}

export interface CaptureDetails {
	sourceId: string;
	packetDir: string;
	sourcePagePath: string;
	title: string;
	status: "captured";
}

export interface PreparedSource {
	sourceId: string;
	title: string;
	kind: string;
	status: SourceManifest["status"];
	capturedAt: string;
	integratedAt?: string;
	packetDir: string;
	manifestPath: string;
	extractedPath: string;
	sourcePagePath: string;
	sourcePageExists: boolean;
	summary: string;
	integrationTargets: string[];
	ready: boolean;
	blockers: string[];
}

export interface IngestPrepareDetails {
	count: number;
	sources: PreparedSource[];
}

export interface IngestFinalizeDetails {
	integratedAt: string;
	finalized: string[];
	skipped: Array<{ sourceId: string; reason: string }>;
}

export interface EnsurePageConflictDetails {
	resolved: false;
	created: false;
	conflict: true;
	candidates: Array<{ path: string; title: string }>;
}

export interface EnsurePageResolvedDetails {
	resolved: true;
	created: boolean;
	conflict: false;
	path: string;
	title: string;
	type: WikiPageType;
}

export type EnsurePageDetails = EnsurePageConflictDetails | EnsurePageResolvedDetails;

export interface WikiStatusDetails {
	initialized: boolean;
	host?: string;
	root?: string;
	total?: number;
	visible?: number;
	source?: number;
	canonical?: number;
	journal?: number;
	captured?: number;
	integrated?: number;
	domains?: Record<string, number>;
}

export interface LintDetails {
	counts: LintRun["counts"];
	issues: LintIssue[];
}
