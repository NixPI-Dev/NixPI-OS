/** Narrow YAML frontmatter parsing and serialization for wiki markdown files. */

/** Result of parsing YAML frontmatter from a markdown string. */
export interface ParsedFrontmatter<T> {
	attributes: T;
	body: string;
	bodyBegin: number;
	frontmatter: string;
}

/** Frontmatter keys that are parsed as comma-separated arrays. */
const FRONTMATTER_ARRAY_KEYS = new Set(["tags", "links", "aliases", "hosts", "areas", "source_ids", "integration_targets"]);

function quoteString(value: string): string {
	if (value === "") return "''";
	if (/^\s|\s$|^[-?:,[\]{}#&*!|>'\"%@`]|:\s|[\n\r]/.test(value)) {
		return `'${value.replace(/'/g, "''")}'`;
	}
	return value;
}

function serializeValue(value: unknown): string {
	if (typeof value === "string") return quoteString(value);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value === null || value === undefined) return "''";
	return quoteString(String(value));
}

/** Serialize a data object and markdown body into a frontmatter-delimited string. */
export function stringifyFrontmatter<T extends object>(data: T, content: string): string {
	const keys = Object.keys(data);
	if (keys.length === 0) return `---\n---\n${content}`;
	const yamlStr = Object.entries(data as Record<string, unknown>)
		.map(([key, value]) => {
			if (Array.isArray(value)) {
				if (value.length === 0) return `${key}: []`;
				return `${key}:\n${value.map((entry) => `  - ${serializeValue(entry)}`).join("\n")}`;
			}
			return `${key}: ${serializeValue(value)}`;
		})
		.join("\n");
	return `---\n${yamlStr}\n---\n${content}`;
}

function parseScalar(raw: string): unknown {
	const value = raw.trim();
	if (value === "''" || value === '""') return "";
	if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
		return value.slice(1, -1).replace(/''/g, "'");
	}
	if (value === "true") return true;
	if (value === "false") return false;
	if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
	return value;
}

function parseInlineArray(raw: string): unknown[] {
	const inner = raw.trim().slice(1, -1).trim();
	if (!inner) return [];
	return inner.split(",").map((entry) => parseScalar(entry.trim()));
}

function parseFrontmatterYaml(frontmatter: string): Record<string, unknown> | undefined {
	const attributes: Record<string, unknown> = {};
	const lines = frontmatter.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (!line.trim()) continue;
		if (/^\s*-\s+/.test(line)) return undefined;
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
		if (!match) return undefined;
		const key = match[1];
		const rawValue = match[2] ?? "";
		if (rawValue.trim() === "") {
			const values: unknown[] = [];
			let consumedList = false;
			while (i + 1 < lines.length) {
				const next = lines[i + 1];
				const listMatch = next.match(/^\s+-\s*(.*)$/);
				if (!listMatch) break;
				values.push(parseScalar(listMatch[1] ?? ""));
				i += 1;
				consumedList = true;
			}
			attributes[key] = consumedList ? values : "";
			continue;
		}
		const trimmed = rawValue.trim();
		attributes[key] = trimmed.startsWith("[") && trimmed.endsWith("]")
			? parseInlineArray(trimmed)
			: parseScalar(trimmed);
	}
	return attributes;
}

/** Parse YAML frontmatter from a markdown string. Returns attributes, body, and metadata. Supports comma-separated arrays and YAML-style list arrays. */
export function parseFrontmatter<T extends Record<string, unknown> = Record<string, unknown>>(
	str: string,
): ParsedFrontmatter<T> {
	const empty: ParsedFrontmatter<T> = { attributes: {} as T, body: str, bodyBegin: 1, frontmatter: "" };
	if (!str.startsWith("---\n")) return empty;

	const closingIdx = str.indexOf("\n---\n", 4);
	const endsWithDelimiter = closingIdx === -1 && str.match(/\n---$/);

	if (closingIdx === -1 && !endsWithDelimiter) return empty;

	const fmEnd = closingIdx !== -1 ? closingIdx : str.length - 3;
	const frontmatter = str.slice(4, fmEnd);
	const body = closingIdx !== -1 ? str.slice(closingIdx + 5) : "";

	const attributes = parseFrontmatterYaml(frontmatter);
	if (!attributes) return empty;

	// Compat layer: split comma-separated strings into arrays for known keys
	for (const key of FRONTMATTER_ARRAY_KEYS) {
		const val = attributes[key];
		if (typeof val === "string" && val.includes(",")) {
			attributes[key] = val
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		}
	}

	const bodyBegin = frontmatter.split("\n").length + 3;
	return {
		attributes: attributes as T,
		body,
		bodyBegin,
		frontmatter,
	};
}
