/**
 * Pi-specific utility helpers for the nixpi wiki module.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export { err, ok, nowIso, type ActionResult } from "./core-utils.ts";

/** Convert an ActionResult to the tool result shape expected by pi-coding-agent. */
export function toToolResult<TDetails extends object>(result: ActionResult<TDetails>) {
	if (result.isErr()) {
		return textToolResult(result.error, {}, true);
	}
	return textToolResult(result.value.text, result.value.details ?? {});
}

export function truncate(text: string): string {
	return truncateHead(text, { maxLines: 2000, maxBytes: 50000 }).content;
}

// --- Pi tool bridge ---

export type RegisteredExtensionTool = Parameters<ExtensionAPI["registerTool"]>[0];
export const EmptyToolParams = Type.Object({});

export function textToolResult<TDetails extends object>(
	text: string,
	details: TDetails = {} as TDetails,
	isError?: boolean,
) {
	return {
		content: [{ type: "text" as const, text }],
		details,
		...(isError !== undefined ? { isError } : {}),
	};
}

export function errorResult(message: string) {
	return textToolResult(message, {}, true);
}

export function registerTools(pi: ExtensionAPI, tools: readonly RegisteredExtensionTool[]): void {
	for (const tool of tools) {
		pi.registerTool(tool);
	}
}
