import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

type RegistryEntry = {
  type: string;
  path: string;
  title: string;
  status?: string;
  hosts?: string[];
  domain?: string;
  due?: string;
  startDate?: string;
  remindAt?: string;
};

type RegistryData = {
  pages?: RegistryEntry[];
};

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentHost(): string {
  return (process.env.PI_LLM_WIKI_HOST ?? os.hostname()).trim().toLowerCase();
}

function normalizeHosts(hosts: string[] | undefined): string[] {
  return [...new Set((hosts ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean))];
}

function appliesToHost(hosts: string[] | undefined, currentHost = getCurrentHost()): boolean {
  const normalized = normalizeHosts(hosts);
  if (normalized.length === 0) return true;
  if (normalized.includes("all") || normalized.includes("*")) return true;
  return normalized.includes(currentHost);
}

function getWikiRoot(): string {
  return process.env.PI_LLM_WIKI_DIR ?? path.join(process.cwd(), "Knowledge");
}

function loadRegistry(): RegistryEntry[] {
  const registryPath = path.join(getWikiRoot(), "meta", "registry.json");
  if (!existsSync(registryPath)) return [];

  try {
    const raw = readFileSync(registryPath, "utf-8");
    const parsed = JSON.parse(raw) as RegistryData;
    return Array.isArray(parsed.pages) ? parsed.pages : [];
  } catch (err) {
    console.error("Failed to load wiki registry:", err);
    return [];
  }
}

function isVisiblePersonal(entry: RegistryEntry): boolean {
  if (!appliesToHost(entry.hosts)) return false;
  return (entry.domain ?? "").toLowerCase() === "personal";
}

function isOpenTask(entry: RegistryEntry): boolean {
  return entry.type === "task" && entry.status !== "done" && entry.status !== "cancelled";
}

function isOpenReminder(entry: RegistryEntry): boolean {
  return entry.type === "reminder" && entry.status === "open";
}

function formatTask(task: RegistryEntry): string {
  const due = task.due ? ` (due ${task.due})` : "";
  return `- ${task.title}${due}`;
}

function formatEvent(event: RegistryEntry): string {
  const when = event.startDate ?? "unscheduled";
  return `- ${when}: ${event.title}`;
}

function formatReminder(reminder: RegistryEntry): string {
  const due = reminder.remindAt?.slice(0, 10) ?? "unscheduled";
  return `- ${reminder.title} (due ${due})`;
}

export class PersonalPlanner {
  getTodayAgendaText(): string {
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

    if (
      overdueTasks.length === 0 &&
      dueTodayTasks.length === 0 &&
      todaysEvents.length === 0 &&
      todaysReminders.length === 0
    ) {
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

  getOpenPersonalTasksText(): string {
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
