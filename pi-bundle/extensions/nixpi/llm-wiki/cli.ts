#!/usr/bin/env -S node --experimental-strip-types

import { parseArgs } from "node:util";
import { captureFile, captureText } from "./actions-capture.ts";
import { handleIngestFinalize, handleIngestPrepare } from "./actions-ingest.ts";
import { handleWikiLint } from "./actions-lint.ts";
import { handleEnsurePage } from "./actions-pages.ts";
import { handleWikiSearch } from "./actions-search.ts";
import { handleWikiStatus, loadRegistry, rebuildAllMeta } from "./actions-meta.ts";
import { getWikiRoot } from "./paths.ts";
import type { CanonicalPageType } from "./types.ts";
import type { ActionResult } from "./lib/core-utils.ts";

interface GlobalOptions {
	json: boolean;
	wikiRoot?: string;
	host?: string;
	allowedDomains?: string;
	qmdBin?: string;
	qmdCollection?: string;
}

function splitCsv(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function setGlobalEnv(options: GlobalOptions): string {
	if (options.wikiRoot) process.env.PI_LLM_WIKI_DIR = options.wikiRoot;
	if (options.host) process.env.PI_LLM_WIKI_HOST = options.host;
	if (options.allowedDomains) process.env.PI_LLM_WIKI_ALLOWED_DOMAINS = options.allowedDomains;
	if (options.qmdBin) process.env.PI_LLM_WIKI_QMD_BIN = options.qmdBin;
	if (options.qmdCollection) process.env.PI_LLM_WIKI_QMD_COLLECTION = options.qmdCollection;
	return getWikiRoot();
}

function extractGlobalOptions(argv: string[]): { options: GlobalOptions; rest: string[] } {
	const options: GlobalOptions = { json: false };
	const rest: string[] = [];

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--wiki-root") {
			options.wikiRoot = argv[++i];
			continue;
		}
		if (arg === "--host") {
			options.host = argv[++i];
			continue;
		}
		if (arg === "--allowed-domains") {
			options.allowedDomains = argv[++i];
			continue;
		}
		if (arg === "--qmd-bin") {
			options.qmdBin = argv[++i];
			continue;
		}
		if (arg === "--qmd-collection") {
			options.qmdCollection = argv[++i];
			continue;
		}
		rest.push(arg);
	}

	return { options, rest };
}

function printJson(payload: unknown): void {
	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printText(text: string): void {
	process.stdout.write(`${text}\n`);
}

function finishResult<TDetails extends object>(result: ActionResult<TDetails>, json: boolean): never {
	if (result.isErr()) {
		if (json) {
			printJson({ ok: false, error: result.error });
		} else {
			printText(result.error);
		}
		process.exit(1);
	}

	if (json) {
		printJson({ ok: true, text: result.value.text, details: result.value.details ?? {} });
	} else {
		printText(result.value.text);
	}
	process.exit(0);
}

function finishMutationResult<TDetails extends object>(wikiRoot: string, result: ActionResult<TDetails>, json: boolean): never {
	if (!result.isErr()) rebuildAllMeta(wikiRoot);
	finishResult(result, json);
}

function finishOk(text: string, details: Record<string, unknown>, json: boolean): never {
	if (json) {
		printJson({ ok: true, text, details });
	} else {
		printText(text);
	}
	process.exit(0);
}

function fail(message: string, json: boolean, code = 1): never {
	if (json) {
		printJson({ ok: false, error: message });
	} else {
		printText(message);
	}
	process.exit(code);
}

function help(): string {
	return [
		"llm-wiki — portable CLI for the local Markdown wiki runtime",
		"",
		"Usage:",
		"  llm-wiki [global-options] <command> [command-options]",
		"",
		"Global options:",
		"  --wiki-root <path>         Override PI_LLM_WIKI_DIR",
		"  --host <host>             Override PI_LLM_WIKI_HOST",
		"  --allowed-domains <csv>   Override PI_LLM_WIKI_ALLOWED_DOMAINS",
		"  --qmd-bin <path>          Override PI_LLM_WIKI_QMD_BIN",
		"  --qmd-collection <name>   Override PI_LLM_WIKI_QMD_COLLECTION",
		"  --json                    Emit machine-readable JSON",
		"",
		"Commands:",
		"  describe",
		"  status",
		"  search <query> [--type <type>] [--object-type <kind>] [--limit <n>] [--host-scope current|all] [--domain <domain>] [--areas <csv>] [--folder <path>]",
		"  ensure-page --type <type> --title <title> [--object-type <kind>] [--aliases <csv>] [--tags <csv>] [--hosts <csv>] [--domain <domain>] [--areas <csv>] [--folder <path>] [--summary <text>]",
		"  capture text <text> [--title <title>] [--kind <kind>] [--tags <csv>] [--hosts <csv>] [--domain <domain>] [--areas <csv>]",
		"  capture file <absolute-path> [--title <title>] [--kind <kind>] [--tags <csv>] [--hosts <csv>] [--domain <domain>] [--areas <csv>]",
		"  ingest prepare [--status captured|integrated|superseded] [--limit <n>]",
		"  ingest finalize (--source-id <id> ... | --all)",
		"  lint [--mode <mode>]",
		"  rebuild",
	].join("\n");
}

function describePayload(wikiRoot: string) {
	return {
		name: "llm-wiki",
		version: "0.1.0",
		wikiRoot,
		designRule: "deterministic scoping, probabilistic reasoning",
		commands: ["describe", "status", "search", "ensure-page", "capture", "ingest", "lint", "rebuild"],
		env: [
			"PI_LLM_WIKI_DIR",
			"PI_LLM_WIKI_HOST",
			"PI_LLM_WIKI_ALLOWED_DOMAINS",
			"PI_LLM_WIKI_QMD_BIN",
			"PI_LLM_WIKI_QMD_COLLECTION",
		],
	};
}

async function main() {
	const argv = process.argv.slice(2);
	if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
		printText(help());
		process.exit(0);
	}

	const { options, rest } = extractGlobalOptions(argv);
	const wikiRoot = setGlobalEnv(options);
	const command = rest[0];
	const commandArgs = rest.slice(1);

	if (!command) fail(help(), options.json, 0);

	if (command === "describe") {
		const payload = describePayload(wikiRoot);
		if (options.json) {
			printJson({ ok: true, details: payload });
		} else {
			printText([
				`${payload.name} v${payload.version}`,
				`Wiki root: ${payload.wikiRoot}`,
				`Design rule: ${payload.designRule}`,
				`Commands: ${payload.commands.join(", ")}`,
			].join("\n"));
		}
		process.exit(0);
	}

	if (command === "status") {
		finishResult(handleWikiStatus(wikiRoot), options.json);
	}

	if (command === "rebuild") {
		const artifacts = rebuildAllMeta(wikiRoot);
		const registry = artifacts.registry;
		finishOk(
			`Rebuilt wiki metadata for ${wikiRoot}`,
			{
				root: wikiRoot,
				pages: registry.pages.length,
				generatedAt: registry.generatedAt,
			},
			options.json,
		);
	}

	if (command === "search") {
		const parsed = parseArgs({
			args: commandArgs,
			allowPositionals: true,
			strict: true,
			options: {
				type: { type: "string" },
				"object-type": { type: "string" },
				limit: { type: "string" },
				"host-scope": { type: "string" },
				domain: { type: "string" },
				areas: { type: "string" },
				folder: { type: "string" },
			},
		});
		const query = parsed.positionals.join(" ").trim();
		if (!query) fail("search requires a query", options.json);
		const registry = loadRegistry(wikiRoot);
		finishResult(
			handleWikiSearch(registry, query, {
				type: parsed.values.type,
				objectType: parsed.values["object-type"],
				limit: parsed.values.limit ? Number.parseInt(parsed.values.limit, 10) : undefined,
				hostScope: parsed.values["host-scope"] as "current" | "all" | undefined,
				domain: parsed.values.domain,
				areas: splitCsv(parsed.values.areas),
				folder: parsed.values.folder,
			}),
			options.json,
		);
	}

	if (command === "ensure-page") {
		const parsed = parseArgs({
			args: commandArgs,
			allowPositionals: false,
			strict: true,
			options: {
				type: { type: "string" },
				title: { type: "string" },
				"object-type": { type: "string" },
				aliases: { type: "string" },
				tags: { type: "string" },
				hosts: { type: "string" },
				domain: { type: "string" },
				areas: { type: "string" },
				folder: { type: "string" },
				summary: { type: "string" },
			},
		});
		if (!parsed.values.type || !parsed.values.title) {
			fail("ensure-page requires --type and --title", options.json);
		}
		finishMutationResult(
			wikiRoot,
			handleEnsurePage(wikiRoot, {
				type: parsed.values.type as CanonicalPageType,
				title: parsed.values.title,
				objectType: parsed.values["object-type"],
				aliases: splitCsv(parsed.values.aliases),
				tags: splitCsv(parsed.values.tags),
				hosts: splitCsv(parsed.values.hosts),
				domain: parsed.values.domain,
				areas: splitCsv(parsed.values.areas),
				folder: parsed.values.folder,
				summary: parsed.values.summary,
			}),
			options.json,
		);
	}

	if (command === "capture") {
		const mode = commandArgs[0];
		const parsed = parseArgs({
			args: commandArgs.slice(1),
			allowPositionals: true,
			strict: true,
			options: {
				title: { type: "string" },
				kind: { type: "string" },
				tags: { type: "string" },
				hosts: { type: "string" },
				domain: { type: "string" },
				areas: { type: "string" },
			},
		});
		const common = {
			title: parsed.values.title,
			kind: parsed.values.kind,
			tags: splitCsv(parsed.values.tags),
			hosts: splitCsv(parsed.values.hosts),
			domain: parsed.values.domain,
			areas: splitCsv(parsed.values.areas),
		};

		if (mode === "text") {
			const text = parsed.positionals.join(" ").trim();
			if (!text) fail("capture text requires inline text", options.json);
			finishMutationResult(wikiRoot, captureText(wikiRoot, text, common), options.json);
		}

		if (mode === "file") {
			const filePath = parsed.positionals[0];
			if (!filePath) fail("capture file requires an absolute file path", options.json);
			finishMutationResult(wikiRoot, captureFile(wikiRoot, filePath, common), options.json);
		}

		fail("capture requires a mode: text | file", options.json);
	}

	if (command === "ingest") {
		const mode = commandArgs[0];
		if (mode === "prepare") {
			const parsed = parseArgs({
				args: commandArgs.slice(1),
				allowPositionals: false,
				strict: true,
				options: {
					status: { type: "string" },
					limit: { type: "string" },
				},
			});
			finishResult(handleIngestPrepare(wikiRoot, {
				status: parsed.values.status as "captured" | "integrated" | "superseded" | undefined,
				limit: parsed.values.limit ? Number.parseInt(parsed.values.limit, 10) : undefined,
			}), options.json);
		}

		if (mode === "finalize") {
			const parsed = parseArgs({
				args: commandArgs.slice(1),
				allowPositionals: false,
				strict: true,
				options: {
					"source-id": { type: "string", multiple: true },
					all: { type: "boolean" },
				},
			});
			finishMutationResult(wikiRoot, handleIngestFinalize(wikiRoot, {
				sourceIds: parsed.values["source-id"],
				all: parsed.values.all,
			}), options.json);
		}

		fail("ingest requires a mode: prepare | finalize", options.json);
	}

	if (command === "lint") {
		const parsed = parseArgs({
			args: commandArgs,
			allowPositionals: false,
			strict: true,
			options: {
				mode: { type: "string" },
			},
		});
		finishResult(handleWikiLint(wikiRoot, parsed.values.mode as never), options.json);
	}

	fail(`Unknown command: ${command}\n\n${help()}`, options.json);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	printJson({ ok: false, error: message });
	process.exit(1);
});
