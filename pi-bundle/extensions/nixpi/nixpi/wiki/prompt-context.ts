import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { parseFrontmatter } from "./lib/frontmatter.ts";
import { getWikiRootForDomain } from "./paths.ts";

const PERSONA_PAGES = [
	"pages/projects/nixpi/persona/soul.md",
	"pages/projects/nixpi/persona/body.md",
	"pages/projects/nixpi/persona/faculty.md",
	"pages/projects/nixpi/persona/skill.md",
] as const;

const CAVEMAN_PAGE = "pages/projects/nixpi/persona/caveman-lite.md";

export const CAVEMAN_STATE_ENTRY = "caveman-lite-enabled";
export const CAVEMAN_STATUS_KEY = "caveman-lite";

function getTechnicalWikiRoot(): string {
	return getWikiRootForDomain("technical");
}

function readWikiPromptPage(wikiRoot: string, relativePath: string): string {
	const filePath = path.join(wikiRoot, relativePath);
	if (!existsSync(filePath)) return "";
	const parsed = parseFrontmatter(readFileSync(filePath, "utf-8"));
	return parsed.body.trim();
}

export function buildPersonaPromptBlock(): string {
	const wikiRoot = getTechnicalWikiRoot();
	const sections = PERSONA_PAGES
		.map((relativePath) => readWikiPromptPage(wikiRoot, relativePath))
		.filter(Boolean);
	if (sections.length === 0) return "";
	return `\n\n[PI PERSONA]\n${sections.join("\n\n")}`;
}

export function buildCavemanPromptBlock(): string {
	const wikiRoot = getTechnicalWikiRoot();
	const content = readWikiPromptPage(wikiRoot, CAVEMAN_PAGE);
	if (!content) return "";
	return `\n\n[CAVEMAN LITE]\n${content}`;
}

export function readCavemanState(ctx: Pick<ExtensionContext, "sessionManager">): boolean {
	let enabled = true;
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "custom" || entry.customType !== CAVEMAN_STATE_ENTRY) continue;
		const value = (entry.data as { enabled?: boolean } | undefined)?.enabled;
		if (typeof value === "boolean") enabled = value;
	}
	return enabled;
}

export function syncCavemanStatus(ctx: Pick<ExtensionContext, "ui">, enabled: boolean): void {
	ctx.ui.setStatus(CAVEMAN_STATUS_KEY, enabled ? "caveman-lite: on" : "caveman-lite: off");
}
