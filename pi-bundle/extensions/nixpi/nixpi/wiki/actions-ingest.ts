import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { appendEvent, buildRegistry, scanPages } from "./actions-meta.ts";
import { atomicWriteFile } from "./lib/filesystem.ts";
import { parseFrontmatter, stringifyFrontmatter } from "./lib/frontmatter.ts";
import { err, nowIso, ok } from "./lib/core-utils.ts";
import type {
	ActionResult,
	IngestFinalizeDetails,
	IngestPrepareDetails,
	PreparedSource,
	SourceManifest,
	SourcePageFrontmatter,
} from "./types.ts";

function rawDir(wikiRoot: string): string {
	return path.join(wikiRoot, "raw");
}

function sourcePacketDir(wikiRoot: string, sourceId: string): string {
	return path.join(rawDir(wikiRoot), sourceId);
}

function sourcePageRelPath(sourceId: string): string {
	return path.join("pages", "sources", `${sourceId}.md`).replace(/\\/g, "/");
}

function sourcePageAbsPath(wikiRoot: string, sourceId: string): string {
	return path.join(wikiRoot, sourcePageRelPath(sourceId));
}

function readManifest(filePath: string): SourceManifest | undefined {
	try {
		return JSON.parse(readFileSync(filePath, "utf8")) as SourceManifest;
	} catch {
		return undefined;
	}
}

function normalizeIntegrationTarget(value: string): string {
	const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
	if (!normalized) return normalized;
	if (normalized.startsWith("pages/")) return normalized;
	return normalized.endsWith(".md") ? `pages/${normalized}` : `pages/${normalized}.md`;
}

function sourcePageFrontmatter(wikiRoot: string, sourceId: string): SourcePageFrontmatter | undefined {
	const pagePath = sourcePageAbsPath(wikiRoot, sourceId);
	if (!existsSync(pagePath)) return undefined;
	const raw = readFileSync(pagePath, "utf8");
	const { attributes } = parseFrontmatter<SourcePageFrontmatter>(raw);
	return attributes;
}

function sourceIntegrationBlockers(
	wikiRoot: string,
	sourceId: string,
	frontmatter: SourcePageFrontmatter | undefined,
): { summary: string; integrationTargets: string[]; blockers: string[] } {
	if (!frontmatter) {
		return { summary: "", integrationTargets: [], blockers: ["missing-source-page"] };
	}

	const pages = scanPages(wikiRoot);
	const registry = buildRegistry(pages);
	const pagesByPath = new Map(registry.pages.map((page) => [page.path, page]));
	const summary = typeof frontmatter.summary === "string" ? frontmatter.summary.trim() : "";
	const integrationTargets = Array.isArray(frontmatter.integration_targets)
		? [...new Set(frontmatter.integration_targets.map(normalizeIntegrationTarget).filter(Boolean))]
		: [];
	const blockers: string[] = [];

	if (!summary) blockers.push("empty-summary");
	if (integrationTargets.length === 0) blockers.push("no-integration-targets");

	for (const target of integrationTargets) {
		const targetPage = pagesByPath.get(target);
		if (!targetPage) {
			blockers.push(`missing-target:${target}`);
			continue;
		}
		if (targetPage.type === "source") {
			blockers.push(`invalid-target-type:${target}`);
			continue;
		}
		if (!targetPage.sourceIds.includes(sourceId)) {
			blockers.push(`target-missing-source-id:${target}`);
		}
	}

	return { summary, integrationTargets, blockers };
}

function listSourcePackets(wikiRoot: string): PreparedSource[] {
	const dir = rawDir(wikiRoot);
	if (!existsSync(dir)) return [];

	const packets = readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort()
		.map((sourceId) => {
			const packetDir = sourcePacketDir(wikiRoot, sourceId);
			const manifestPath = path.join(packetDir, "manifest.json");
			const manifest = readManifest(manifestPath);
			if (!manifest) return undefined;

			const sourcePagePath = sourcePageRelPath(sourceId);
			const sourcePageExists = existsSync(sourcePageAbsPath(wikiRoot, sourceId));
			const pageFrontmatter = sourcePageFrontmatter(wikiRoot, sourceId);
			const { summary, integrationTargets, blockers } = sourceIntegrationBlockers(wikiRoot, sourceId, pageFrontmatter);
			return {
				sourceId,
				title: manifest.title,
				kind: manifest.kind,
				status: manifest.status,
				capturedAt: manifest.capturedAt,
				integratedAt: manifest.integratedAt,
				packetDir: path.join("raw", sourceId).replace(/\\/g, "/"),
				manifestPath: path.join("raw", sourceId, "manifest.json").replace(/\\/g, "/"),
				extractedPath: path.join("raw", sourceId, "extracted.md").replace(/\\/g, "/"),
				sourcePagePath,
				sourcePageExists,
				summary,
				integrationTargets,
				ready: blockers.length === 0,
				blockers,
			};
		})
		.filter((packet): packet is PreparedSource => packet !== undefined)
		.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

	return packets;
}

export function handleIngestPrepare(
	wikiRoot: string,
	options: { status?: SourceManifest["status"]; limit?: number } = {},
): ActionResult<IngestPrepareDetails> {
	const allPackets = listSourcePackets(wikiRoot);
	const filtered = allPackets
		.filter((packet) => !options.status || packet.status === options.status)
		.slice(0, options.limit ?? Number.MAX_SAFE_INTEGER);

	const scopeText = options.status ? ` with status=${options.status}` : "";
	if (filtered.length === 0) {
		return ok({
			text: `No source packets ready for ingest${scopeText}.`,
			details: { count: 0, sources: [] },
		});
	}

	const lines = [
		`Prepared ${filtered.length} source packet(s)${scopeText}:`,
		...filtered.map((packet) =>
			`- ${packet.sourceId} | ${packet.title} | ${packet.kind} | ${packet.status} | ${packet.ready ? "ready" : `blocked: ${packet.blockers.join(", ")}`} | ${packet.extractedPath}`,
		),
	];

	return ok({
		text: lines.join("\n"),
		details: { count: filtered.length, sources: filtered },
	});
}

function writeManifest(wikiRoot: string, manifest: SourceManifest): void {
	const manifestPath = path.join(sourcePacketDir(wikiRoot, manifest.sourceId), "manifest.json");
	mkdirSync(path.dirname(manifestPath), { recursive: true });
	atomicWriteFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function markSourcePageIntegrated(wikiRoot: string, sourceId: string, integratedAt: string): void {
	const pagePath = sourcePageAbsPath(wikiRoot, sourceId);
	if (!existsSync(pagePath)) {
		throw new Error(`Source page missing for ${sourceId}: ${sourcePageRelPath(sourceId)}`);
	}

	const raw = readFileSync(pagePath, "utf8");
	const { attributes, body } = parseFrontmatter<SourcePageFrontmatter & Record<string, unknown>>(raw);
	const updated: SourcePageFrontmatter & Record<string, unknown> = {
		...attributes,
			status: "integrated",
			integrated_at: integratedAt,
			updated: integratedAt.slice(0, 10),
			validation_level: !attributes.validation_level || attributes.validation_level === "seed"
				? "working"
			: attributes.validation_level,
		source_ids: Array.isArray(attributes.source_ids)
			? [...new Set([...attributes.source_ids, sourceId])]
			: [sourceId],
		integration_targets: Array.isArray(attributes.integration_targets)
			? [...new Set(attributes.integration_targets.map(normalizeIntegrationTarget).filter(Boolean))]
			: [],
	};
	atomicWriteFile(pagePath, stringifyFrontmatter(updated, body));
}

export function handleIngestFinalize(
	wikiRoot: string,
	options: { sourceIds?: string[]; all?: boolean } = {},
): ActionResult<IngestFinalizeDetails> {
	const allPackets = listSourcePackets(wikiRoot);
	const packetById = new Map(allPackets.map((packet) => [packet.sourceId, packet]));
	const requestedIds = options.all ? allPackets.map((packet) => packet.sourceId) : options.sourceIds ?? [];

	if (requestedIds.length === 0) {
		return err("ingest finalize requires --source-id <id> (repeatable) or --all");
	}

	const finalized: string[] = [];
	const skipped: Array<{ sourceId: string; reason: string }> = [];
	const integratedAt = nowIso();

	for (const sourceId of requestedIds) {
		const packet = packetById.get(sourceId);
		if (!packet) {
			skipped.push({ sourceId, reason: "missing-packet" });
			continue;
		}
		if (packet.status !== "captured") {
			skipped.push({ sourceId, reason: `status=${packet.status}` });
			continue;
		}
		if (!packet.ready) {
			skipped.push({ sourceId, reason: `blocked:${packet.blockers.join(",")}` });
			continue;
		}

		const manifestPath = path.join(sourcePacketDir(wikiRoot, sourceId), "manifest.json");
		const manifest = readManifest(manifestPath);
		if (!manifest) {
			skipped.push({ sourceId, reason: "invalid-manifest" });
			continue;
		}

		try {
			markSourcePageIntegrated(wikiRoot, sourceId, integratedAt);
			writeManifest(wikiRoot, {
				...manifest,
				status: "integrated",
				integratedAt,
			});
			appendEvent(wikiRoot, {
				ts: integratedAt,
				kind: "integrate",
				title: `Integrated ${manifest.title}`,
				sourceIds: [sourceId],
				pagePaths: [sourcePageRelPath(sourceId)],
			});
			finalized.push(sourceId);
		} catch (error) {
			skipped.push({
				sourceId,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const lines = [
		`Integrated ${finalized.length} source packet(s).`,
		...(finalized.length > 0 ? finalized.map((sourceId) => `- integrated: ${sourceId}`) : []),
		...(skipped.length > 0 ? skipped.map((entry) => `- skipped: ${entry.sourceId} (${entry.reason})`) : []),
	];

	return ok({
		text: lines.join("\n"),
		details: { integratedAt, finalized, skipped },
	});
}
