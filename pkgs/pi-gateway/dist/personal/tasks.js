import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "chrono-node";
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
function formatDate(date) {
    return date.toISOString().slice(0, 10);
}
function slugify(value) {
    return value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/[-\s]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "task";
}
function titleCase(value) {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word[0] ? word[0].toUpperCase() + word.slice(1) : word)
        .join(" ");
}
function cleanActionText(value) {
    return value
        .replace(/^[\s,.-]+/, "")
        .replace(/[\s,.-]+$/, "")
        .replace(/^(to|for|about)\s+/i, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}
function ensureUniquePath(baseDir, slug) {
    let candidate = slug;
    let index = 2;
    while (existsSync(path.join(baseDir, `${candidate}.md`))) {
        candidate = `${slug}-${index}`;
        index += 1;
    }
    return {
        path: path.join(baseDir, `${candidate}.md`),
        id: `task/${candidate}`,
    };
}
function extractTaskBody(input) {
    const patterns = [
        /^task\s*:\s*(.+)$/i,
        /^todo\s*:\s*(.+)$/i,
        /^add\s+(?:a\s+)?task\s+to\s+(.+)$/i,
        /^create\s+(?:a\s+)?task\s+to\s+(.+)$/i,
        /^add\s+to\s+my\s+tasks\s*:\s*(.+)$/i,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(input.trim());
        if (match?.[1])
            return match[1].trim();
    }
    return null;
}
function maybeExtractDue(body) {
    const parsed = parse(body, new Date(), { forwardDate: true })[0];
    if (!parsed) {
        return { action: cleanActionText(body) };
    }
    const hasDateCue = /\b(by|on|tomorrow|today|tonight|next|this|friday|saturday|sunday|monday|tuesday|wednesday|thursday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(body);
    if (!hasDateCue) {
        return { action: cleanActionText(body) };
    }
    const actionRaw = `${body.slice(0, parsed.index)} ${body.slice(parsed.index + parsed.text.length)}`;
    const action = cleanActionText(actionRaw);
    if (!action) {
        return { action: cleanActionText(body) };
    }
    return {
        action,
        due: formatDate(parsed.start.date()),
    };
}
export class PersonalTaskService {
    createFromNaturalLanguage(input) {
        const body = extractTaskBody(input);
        if (!body)
            return null;
        const { action, due } = maybeExtractDue(body);
        if (!action) {
            return "I couldn't figure out the task action. Try something like 'task: renew passport' or 'add a task to book dentist by friday'.";
        }
        const wikiRoot = getWikiRoot();
        const tasksDir = path.join(wikiRoot, "pages", "planner", "tasks");
        mkdirSync(tasksDir, { recursive: true });
        const slug = slugify(action);
        const { path: filePath, id } = ensureUniquePath(tasksDir, slug);
        const title = titleCase(action);
        const today = todayStamp();
        const content = [
            "---",
            `id: ${id}`,
            "schema_version: 1",
            "type: task",
            "object_type: task",
            `title: ${title}`,
            "aliases: []",
            "tags: [task]",
            "domain: personal",
            "areas: []",
            "hosts: []",
            "status: open",
            "validation_level: seed",
            "priority: medium",
            `due: ${due ?? ""}`,
            "scheduled:",
            "schedule:",
            `created: ${today}`,
            `updated: ${today}`,
            "projects: []",
            "people: []",
            "systems: []",
            "sources: []",
            "related: []",
            "depends_on: []",
            "blocked_by: []",
            "completed:",
            "source_ids: []",
            `summary: ${due ? `Task to ${action} by ${due}.` : `Task to ${action}.`}`,
            "---",
            "",
            `# ${title}`,
            "",
            "## Outcome",
            "",
            `Complete: ${action}.`,
            "",
            "## Next action",
            "",
            `- ${action}`,
            "",
            "## Notes",
            "",
            "Captured from Pi WhatsApp personal gateway.",
            "",
            "## Related",
            "",
        ].join("\n");
        writeFileSync(filePath, content, "utf-8");
        return due
            ? `Okay — I created a task due ${due}: ${action}.`
            : `Okay — I created a task: ${action}.`;
    }
}
//# sourceMappingURL=tasks.js.map