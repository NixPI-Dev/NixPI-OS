import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
function getWikiRoot() {
    if (process.env.PI_LLM_WIKI_DIR_PERSONAL)
        return process.env.PI_LLM_WIKI_DIR_PERSONAL;
    for (const entry of (process.env.PI_LLM_WIKI_ROOTS ?? "").split(",")) {
        const [name, ...rest] = entry.split(":");
        if (name?.trim().toLowerCase() === "personal") {
            const root = rest.join(":").trim();
            if (root)
                return root;
        }
    }
    return process.env.PI_LLM_WIKI_DIR ?? path.join(process.cwd(), "Knowledge");
}
function todayStamp() {
    return new Date().toISOString().slice(0, 10);
}
function currentTimeStamp() {
    return new Date().toTimeString().slice(0, 5);
}
function escapeYamlString(value) {
    return value.replace(/:/g, " -");
}
function buildDailyNote(date) {
    return [
        "---",
        `id: journal/${date}`,
        "schema_version: 1",
        "type: journal",
        "object_type: journal",
        `title: ${date}`,
        "aliases: []",
        "tags: [journal, daily]",
        "hosts: []",
        "domain: personal",
        "areas: [journal]",
        "status: active",
        "validation_level: seed",
        `created: ${date}`,
        `updated: ${date}`,
        "projects: []",
        "people: []",
        "systems: []",
        "sources: []",
        "related: []",
        "source_ids: []",
        "summary: Daily log, reflection, and follow-ups.",
        "---",
        `# ${date}`,
        "",
        "## Focus",
        "",
        "## Calendar",
        "",
        "## Log",
        "",
        "## Wins",
        "",
        "## Friction / lessons",
        "",
        "## Tomorrow",
        "",
        "## Follow-ups",
        "",
    ].join("\n");
}
function ensureDailyNote(filePath, date) {
    if (existsSync(filePath)) {
        return readFileSync(filePath, "utf-8");
    }
    const content = buildDailyNote(date);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf-8");
    return content;
}
function updateFrontmatterUpdated(raw, date) {
    if (!raw.startsWith("---\n"))
        return raw;
    const end = raw.indexOf("\n---\n", 4);
    if (end === -1)
        return raw;
    const frontmatter = raw.slice(4, end);
    const body = raw.slice(end + 5);
    const nextFrontmatter = /(^|\n)updated:\s*.*?(\n|$)/.test(frontmatter)
        ? frontmatter.replace(/(^|\n)updated:\s*.*?(\n|$)/, `$1updated: ${date}$2`)
        : `${frontmatter}\nupdated: ${date}`;
    return `---\n${nextFrontmatter}\n---\n${body}`;
}
function appendUnderLog(raw, entry) {
    const whatsappSection = "### WhatsApp";
    if (raw.includes(`${whatsappSection}\n`)) {
        return raw.replace(`${whatsappSection}\n`, `${whatsappSection}\n- ${entry}\n`);
    }
    if (raw.includes("## Log\n")) {
        return raw.replace("## Log\n", `## Log\n\n${whatsappSection}\n- ${entry}\n`);
    }
    const trimmed = raw.replace(/\s+$/g, "");
    return `${trimmed}\n\n## Log\n\n${whatsappSection}\n- ${entry}\n`;
}
export class PersonalJournalService {
    captureFromNaturalLanguage(input) {
        const normalized = input.trim();
        const match = /^(journal|log|reflection|reflect)\s*:\s*(.+)$/i.exec(normalized);
        if (!match)
            return null;
        const entryText = match[2]?.trim();
        if (!entryText) {
            return "I need some journal text after the label, for example: 'journal: felt more grounded after the walk'.";
        }
        const date = todayStamp();
        const time = currentTimeStamp();
        const wikiRoot = getWikiRoot();
        const filePath = path.join(wikiRoot, "pages", "journal", "daily", `${date}.md`);
        const raw = ensureDailyNote(filePath, date);
        const line = `${time} — ${escapeYamlString(entryText)}`;
        const updated = updateFrontmatterUpdated(raw, date);
        const next = appendUnderLog(updated, line);
        writeFileSync(filePath, next, "utf-8");
        return `Okay — I added that to today's journal at ${time}.`;
    }
}
//# sourceMappingURL=journal.js.map