import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
function todayStamp() {
    return new Date().toISOString().slice(0, 10);
}
function getCurrentHost() {
    return (process.env.PI_LLM_WIKI_HOST ?? os.hostname()).trim().toLowerCase();
}
function normalizeHosts(hosts) {
    return [...new Set((hosts ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean))];
}
function appliesToHost(hosts, currentHost = getCurrentHost()) {
    const normalized = normalizeHosts(hosts);
    if (normalized.length === 0)
        return true;
    if (normalized.includes("all") || normalized.includes("*"))
        return true;
    return normalized.includes(currentHost);
}
function getWikiRoot() {
    return process.env.PI_LLM_WIKI_DIR ?? path.join(process.cwd(), "Knowledge");
}
function loadRegistry() {
    const registryPath = path.join(getWikiRoot(), "meta", "registry.json");
    if (!existsSync(registryPath))
        return [];
    try {
        const raw = readFileSync(registryPath, "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.pages) ? parsed.pages : [];
    }
    catch (err) {
        console.error("Failed to load wiki registry:", err);
        return [];
    }
}
function isVisiblePersonal(entry) {
    if (!appliesToHost(entry.hosts))
        return false;
    return (entry.domain ?? "").toLowerCase() === "personal";
}
function isOpenTask(entry) {
    return entry.type === "task" && entry.status !== "done" && entry.status !== "cancelled";
}
function isOpenReminder(entry) {
    return entry.type === "reminder" && entry.status === "open";
}
function formatTask(task) {
    const due = task.due ? ` (due ${task.due})` : "";
    return `- ${task.title}${due}`;
}
function formatEvent(event) {
    const when = event.startDate ?? "unscheduled";
    return `- ${when}: ${event.title}`;
}
function formatReminder(reminder) {
    const due = reminder.remindAt?.slice(0, 10) ?? "unscheduled";
    return `- ${reminder.title} (due ${due})`;
}
export class PersonalPlanner {
    getTodayAgendaText() {
        const today = todayStamp();
        const pages = loadRegistry().filter(isVisiblePersonal);
        const overdueTasks = pages
            .filter((entry) => isOpenTask(entry) && !!entry.due && entry.due < today)
            .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
            .slice(0, 5);
        const dueTodayTasks = pages
            .filter((entry) => isOpenTask(entry) && entry.due === today)
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, 5);
        const todaysEvents = pages
            .filter((entry) => entry.type === "event" && entry.status !== "done" && entry.status !== "cancelled" && entry.startDate === today)
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, 5);
        const todaysReminders = pages
            .filter((entry) => isOpenReminder(entry) && entry.remindAt?.slice(0, 10) === today)
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, 5);
        if (overdueTasks.length === 0 &&
            dueTodayTasks.length === 0 &&
            todaysEvents.length === 0 &&
            todaysReminders.length === 0) {
            return "Your personal agenda looks clear today. No due tasks, events, or reminders are visible right now.";
        }
        const lines = [`Personal agenda for ${today}:`];
        if (overdueTasks.length > 0) {
            lines.push("", "Overdue tasks:", ...overdueTasks.map(formatTask));
        }
        if (dueTodayTasks.length > 0) {
            lines.push("", "Due today:", ...dueTodayTasks.map(formatTask));
        }
        if (todaysEvents.length > 0) {
            lines.push("", "Events:", ...todaysEvents.map(formatEvent));
        }
        if (todaysReminders.length > 0) {
            lines.push("", "Reminders:", ...todaysReminders.map(formatReminder));
        }
        return lines.join("\n");
    }
    getOpenPersonalTasksText() {
        const pages = loadRegistry().filter(isVisiblePersonal);
        const dueTasks = pages
            .filter((entry) => isOpenTask(entry) && !!entry.due)
            .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "") || a.title.localeCompare(b.title))
            .slice(0, 10);
        const undatedTasks = pages
            .filter((entry) => isOpenTask(entry) && !entry.due)
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, 10);
        if (dueTasks.length === 0 && undatedTasks.length === 0) {
            return "You have no open personal tasks right now.";
        }
        const lines = ["Open personal tasks:"];
        if (dueTasks.length > 0) {
            lines.push("", "With due dates:", ...dueTasks.map(formatTask));
        }
        if (undatedTasks.length > 0) {
            lines.push("", "Without due dates:", ...undatedTasks.map(formatTask));
        }
        return lines.join("\n");
    }
}
//# sourceMappingURL=planner.js.map