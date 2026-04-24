/**
 * llm-wiki — local wiki capture, search, scaffolding, linting, and metadata rebuilds.
 *
 * @tools wiki_status, wiki_capture, wiki_search, wiki_ensure_page, wiki_lint, wiki_rebuild
 * @hooks tool_call, agent_end, before_agent_start, session_start, session_shutdown, session_before_compact
 */
import { StringEnum } from "@mariozechner/pi-ai";
import { type ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { captureFile, captureText } from "./actions-capture.ts";
import { handleWikiLint } from "./actions-lint.ts";
import { buildWikiDigest, handleWikiStatus, loadRegistry, rebuildAllMeta } from "./actions-meta.ts";
import { handleEnsurePage } from "./actions-pages.ts";
import { handleWikiSearch } from "./actions-search.ts";
import { ok, type RegisteredExtensionTool, registerTools, toToolResult, type ActionResult } from "./lib/utils.ts";
import { getCurrentHost, getAllowedDomains, getWikiRoot, getWikiRootForDomain, getWikiRoots, isProtectedPath, isWikiPagePath } from "./paths.ts";
import { buildCavemanPromptBlock, buildPersonaPromptBlock, CAVEMAN_STATE_ENTRY, readCavemanState, syncCavemanStatus } from "./prompt-context.ts";
import { buildCompactionContext, loadContext, restoredContextBlock, type SavedContext, saveContext } from "./runtime-policy.ts";
import type { CanonicalPageType } from "./types.ts";

const PageTypeEnum = StringEnum([
	"source", "concept", "entity", "synthesis", "analysis",
	"evolution", "procedure", "decision", "identity", "journal",
	"task", "event", "reminder",
] as const);

const CanonicalTypeEnum = StringEnum([
	"concept", "entity", "synthesis", "analysis",
	"evolution", "procedure", "decision", "identity", "journal",
	"task", "event", "reminder",
] as const);

const LintModeEnum = StringEnum(["links", "orphans", "frontmatter", "duplicates", "coverage", "staleness", "stale-reviews", "empty-summary", "duplicate-id", "unresolved-ids", "thin-content", "crossref-gaps", "contradiction-review", "missing-concepts", "all"] as const);
const HostScopeEnum = StringEnum(["current", "all"] as const);

const WikiCaptureParams = Type.Object({
	input_type: StringEnum(["text", "file"] as const),
	value: Type.String({ description: "Text content or an absolute file path to capture." }),
	title: Type.Optional(Type.String({ description: "Optional title override." })),
	kind: Type.Optional(Type.String({ description: "Optional source kind, for example note or pdf." })),
	tags: Type.Optional(Type.Array(Type.String())),
	hosts: Type.Optional(Type.Array(Type.String({ description: "Optional host scope. Omit for global knowledge shared across hosts." }))),
	domain: Type.Optional(Type.String({ description: "Optional domain such as technical or personal." })),
	areas: Type.Optional(Type.Array(Type.String({ description: "Optional areas such as nixos, pi, health, writing, etc." }))),
});

const WikiSearchParams = Type.Object({
	query: Type.String({ description: "Search query." }),
	type: Type.Optional(PageTypeEnum),
	object_type: Type.Optional(Type.String({ description: "Filter by object_type frontmatter field (e.g. person, host, task, project, meeting)." })),
	limit: Type.Optional(Type.Number({ description: "Maximum results to return.", default: 10 })),
	host_scope: Type.Optional(HostScopeEnum),
	domain: Type.Optional(Type.String({ description: "Optional domain filter such as technical or personal." })),
	areas: Type.Optional(Type.Array(Type.String({ description: "Require these areas in frontmatter." }))),
	folder: Type.Optional(
		Type.String({ description: "Optional folder filter under pages/, for example technical, personal, resources/technical, areas/personal, journal/daily." }),
	),
});

const WikiEnsurePageParams = Type.Object({
	type: CanonicalTypeEnum,
	title: Type.String({ description: "Canonical page title." }),
	object_type: Type.Optional(Type.String({ description: "Real-world object kind, e.g. person, project, host, meeting. Sets id prefix, review cycle, and extra frontmatter fields." })),
	aliases: Type.Optional(Type.Array(Type.String())),
	tags: Type.Optional(Type.Array(Type.String())),
	hosts: Type.Optional(Type.Array(Type.String({ description: "Optional host scope. Omit for global knowledge shared across hosts." }))),
	domain: Type.Optional(Type.String({ description: "Optional domain such as technical or personal." })),
	areas: Type.Optional(Type.Array(Type.String({ description: "Optional areas such as nixos, pi, health, writing, etc." }))),
	folder: Type.Optional(
		Type.String({ description: "Optional folder under pages/, for example technical, personal, resources/technical, areas/personal, journal/daily." }),
	),
	summary: Type.Optional(Type.String({ description: "Optional one-line summary." })),
});

const WikiDomainParams = Type.Object({
	domain: Type.Optional(Type.String({ description: "Optional domain such as technical or personal." })),
});

const WikiLintParams = Type.Object({
	mode: Type.Optional(LintModeEnum),
	domain: Type.Optional(Type.String({ description: "Optional domain such as technical or personal." })),
});

async function runWikiMutation<TDetails extends object>(wikiRoot: string, operation: () => Promise<ActionResult<TDetails>>) {
	const actionResult = toToolResult(await operation());
	if (!actionResult.isError) rebuildAllMeta(wikiRoot);
	return actionResult;
}

function buildWikiContextPrompt(): string {
	const wikiRoot = getWikiRoot();
	const wikiRoots = getWikiRoots();
	const host = getCurrentHost();
	const allowedDomains = getAllowedDomains();
	return [
		"",
		"",
		"[LLM WIKI CONTEXT]",
		`- Wiki root: ${wikiRoot}`,
		...(Object.keys(wikiRoots).length > 0 ? [`- Wiki roots: ${Object.entries(wikiRoots).map(([domain, root]) => `${domain}:${root}`).join(", ")}`] : []),
		`- Current host: ${host}`,
		"- Plain-Markdown wiki. No app-specific syntax. Use standard Markdown links in note bodies.",
		"- domain: technical or personal separates system from personal knowledge.",
		"- areas: [...] for long-lived themes. id: for stable object identity. object_type: for real-world kind.",
		"- schema_version: 1 on all notes. validation_level: seed | working | trusted | superseded.",
		"- Canonical folders under pages/:",
		"-   home/                         — dashboards and navigation",
		"-   planner/tasks/                — actionable tasks (type: task)",
		"-   planner/calendar/             — events and meetings (type: event)",
		"-   planner/reminders/            — follow-up prompts (type: reminder)",
		"-   planner/reviews/              — weekly/monthly reviews",
		"-   projects/<slug>/              — finite outcomes",
		"-   areas/<slug>/                 — ongoing responsibilities",
		"-   resources/knowledge/          — evergreen concepts",
		"-   resources/people/             — person objects",
		"-   resources/technical/          — hosts, services, tools",
		"-   sources/                      — captured evidence and research",
		"-   journal/daily/                — daily notes (type: journal)",
		"-   journal/weekly/ monthly/      — periodic reflections",
		"-   archives/                     — inactive material",
		"- Templates: templates/markdown/<type>.md. Object schemas: schemas/<object_type>.md.",
		"- wiki_search: query, type, object_type, domain, areas, folder, host_scope filters.",
		"- wiki_ensure_page: creates or resolves; injects id, object_type, schema_version, relation fields.",
		"- wiki_lint: checks links, orphans, frontmatter, duplicates, coverage, staleness, stale reviews, empty summaries, duplicate ids, unresolved relation ids, thin content, cross-reference gaps, contradiction-review pairs, and missing concept candidates.",
		"- qmd: use for full-text body search — qmd search <query> -c wiki or qmd query <query> --no-rerank.",
		"- Pages with hosts: [...] apply only to those hosts. Pages without hosts are global.",
		...(allowedDomains
			? [`- Domain access is restricted to: [${allowedDomains.join(", ")}]. Do not read, reference, or search for pages outside these domains.`]
			: []),
	].join("\n");
}

export default function (pi: ExtensionAPI) {
	let dirty = false;
	let cavemanLiteEnabled = true;
	let restoredContext: SavedContext | null = loadContext();

	const tools: RegisteredExtensionTool[] = [
		{
			name: "wiki_status",
			label: "Wiki Status",
			description: "Show wiki root, current host, page counts, and source state totals.",
			parameters: WikiDomainParams,
			async execute(_toolCallId, params) {
				const typed = (params ?? {}) as Static<typeof WikiDomainParams>;
				return toToolResult(handleWikiStatus(getWikiRootForDomain(typed.domain)));
			},
		},
		{
			name: "wiki_capture",
			label: "Wiki Capture",
			description:
				"Capture text or a local file into a raw source packet and scaffold a source page. Use hosts, domain, and areas for scoped knowledge.",
			parameters: WikiCaptureParams,
			async execute(_toolCallId, params) {
				const typed = params as Static<typeof WikiCaptureParams>;
				const wikiRoot = getWikiRootForDomain(typed.domain);
				return runWikiMutation(wikiRoot, async () =>
					typed.input_type === "file"
						? captureFile(wikiRoot, typed.value, {
								title: typed.title,
								kind: typed.kind,
								tags: typed.tags,
								hosts: typed.hosts,
								domain: typed.domain,
								areas: typed.areas,
							})
						: captureText(wikiRoot, typed.value, {
								title: typed.title,
								kind: typed.kind,
								tags: typed.tags,
								hosts: typed.hosts,
								domain: typed.domain,
								areas: typed.areas,
							}),
				);
			},
		},
		{
			name: "wiki_search",
			label: "Wiki Search",
			description:
				"Search wiki pages by title, aliases, domain, areas, headings, tags, source IDs, and summary text. By default it only returns pages relevant to the current host plus global pages.",
			parameters: WikiSearchParams,
			async execute(_toolCallId, params) {
				const typed = params as Static<typeof WikiSearchParams>;
				const wikiRoot = getWikiRootForDomain(typed.domain);
				return toToolResult(
					handleWikiSearch(loadRegistry(wikiRoot), typed.query, {
						type: typed.type,
						objectType: typed.object_type,
						limit: typed.limit,
						hostScope: typed.host_scope,
						domain: typed.domain,
						areas: typed.areas,
						folder: typed.folder,
					}),
				);
			},
		},
		{
			name: "wiki_ensure_page",
			label: "Wiki Ensure Page",
			description:
				"Resolve an existing page by title or alias, or create a new page if missing. You can place pages directly under pages/technical or pages/personal, under PARA folders like pages/resources/technical, or create journal entries with type=journal.",
			parameters: WikiEnsurePageParams,
			async execute(_toolCallId, params) {
				const typed = params as Static<typeof WikiEnsurePageParams> & { type: CanonicalPageType };
				const wikiRoot = getWikiRootForDomain(typed.domain);
				return runWikiMutation(wikiRoot, async () => handleEnsurePage(wikiRoot, {
					...typed,
					objectType: typed.object_type,
				}));
			},
		},
		{
			name: "wiki_lint",
			label: "Wiki Lint",
			description: "Run structural wiki checks for broken links, frontmatter, duplicates, coverage, staleness, stale reviews, empty summaries, duplicate ids, unresolved relation ids, thin content, cross-reference gaps, contradiction-review pairs, and missing concept candidates.",
			parameters: WikiLintParams,
			async execute(_toolCallId, params) {
				const typed = (params ?? {}) as Static<typeof WikiLintParams>;
				return toToolResult(handleWikiLint(getWikiRootForDomain(typed.domain), typed.mode));
			},
		},
		{
			name: "wiki_rebuild",
			label: "Wiki Rebuild",
			description: "Force-rebuild registry, backlinks, index, and log metadata from current wiki pages.",
			parameters: WikiDomainParams,
			async execute(_toolCallId, params) {
				const typed = (params ?? {}) as Static<typeof WikiDomainParams>;
				rebuildAllMeta(getWikiRootForDomain(typed.domain));
				return toToolResult(ok({ text: "Rebuilt wiki metadata." }));
			},
		},
	];
	registerTools(pi, tools);

	pi.on("session_start", async (_event, ctx) => {
		restoredContext = loadContext();
		cavemanLiteEnabled = readCavemanState(ctx);
		syncCavemanStatus(ctx, cavemanLiteEnabled);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		syncCavemanStatus(ctx, false);
	});

	pi.registerCommand("caveman", {
		description: "Toggle caveman-lite mode. Usage: /caveman [on|off|lite|status]",
		handler: async (args, ctx) => {
			const arg = (args ?? "").trim().toLowerCase();

			if (arg === "" || arg === "status") {
				ctx.ui.notify(`caveman-lite: ${cavemanLiteEnabled ? "on" : "off"}`, "info");
				syncCavemanStatus(ctx, cavemanLiteEnabled);
				return;
			}

			if (["on", "start", "lite"].includes(arg)) {
				cavemanLiteEnabled = true;
			} else if (["off", "stop", "normal"].includes(arg)) {
				cavemanLiteEnabled = false;
			} else {
				ctx.ui.notify("Unknown caveman mode. Use: /caveman on, /caveman off, /caveman lite, /caveman status", "error");
				return;
			}

			pi.appendEntry(CAVEMAN_STATE_ENTRY, { enabled: cavemanLiteEnabled });
			syncCavemanStatus(ctx, cavemanLiteEnabled);
			ctx.ui.notify(`caveman-lite: ${cavemanLiteEnabled ? "on" : "off"}. Takes effect on the next message.`, "info");
		},
	});

	function protectOrMark(pathValue: string) {
		const wikiRoots = [...new Set([getWikiRoot(), ...Object.values(getWikiRoots())])];
		for (const wikiRoot of wikiRoots) {
			if (isProtectedPath(wikiRoot, pathValue)) {
				return { block: true as const, reason: "Wiki protects raw/ and meta/. Use wiki tools instead." };
			}
			if (isWikiPagePath(wikiRoot, pathValue)) dirty = true;
		}
		return undefined;
	}

	pi.on("tool_call", async (event) => {
		if (isToolCallEventType("write", event)) return protectOrMark(event.input.path);
		if (isToolCallEventType("edit", event)) return protectOrMark(event.input.path);

		return undefined;
	});

	pi.on("agent_end", async () => {
		if (!dirty) return;
		dirty = false;
		rebuildAllMeta(getWikiRoot());
	});

	pi.on("before_agent_start", async (event) => {
		const wikiContext = buildWikiContextPrompt();
		const digest = buildWikiDigest(getWikiRoot());
		const persona = buildPersonaPromptBlock();
		const caveman = cavemanLiteEnabled ? buildCavemanPromptBlock() : "";
		let systemPrompt = `${event.systemPrompt}${wikiContext}${digest}${persona}${caveman}`;
		if (restoredContext) {
			systemPrompt += restoredContextBlock(restoredContext);
			restoredContext = null;
		}
		return { systemPrompt };
	});

	pi.on("session_before_compact", async (event, ctx) => {
		restoredContext = buildCompactionContext(ctx.cwd);
		saveContext(restoredContext);
		return {
			compaction: {
				summary: [
					"COMPACTION GUIDANCE — preserve the following across summarization:",
					"1. Active tasks, pending decisions, and open implementation threads.",
					"2. Current repository and host context.",
					"3. Any user constraints, preferences, and follow-up requests.",
					`Tokens before compaction: ${event.preparation.tokensBefore}.`,
				].join("\n"),
				firstKeptEntryId: event.preparation.firstKeptEntryId,
				tokensBefore: event.preparation.tokensBefore,
			},
		};
	});
}
