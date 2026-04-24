import { err, ok, type Result } from "neverthrow";

/** Canonical result type for harness-neutral llm-wiki actions. */
export type ActionResult<TDetails extends object = Record<string, unknown>> = Result<
	{ text: string; details?: TDetails },
	string
>;

export { err, ok };

export function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
