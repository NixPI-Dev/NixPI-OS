import type { InboundMessage } from "./types.js";
import { PersonalJournalService } from "../personal/journal.js";
import { PersonalPlanner } from "../personal/planner.js";
import { PersonalReminderService } from "../personal/reminders.js";
import { PersonalTaskService } from "../personal/tasks.js";
import { classifyIntent } from "./intent-classifier.js";

export type PersonalRoute =
  | { kind: "reply"; text: string }
  | { kind: "prompt"; message: string; systemPromptAddendum: string };

const PERSONAL_SYSTEM_PROMPT = [
  "You are in personal companion mode on WhatsApp.",
  "Stay within personal scope: personal wiki capture, reminders, tasks, journal, agenda, and life management.",
  "Do not provide development, infrastructure, repository, shell, or system administration actions from this channel.",
  "If the user asks for technical or operator work, refuse briefly and direct them to Pi Console/TUI.",
  "Keep replies concise, warm, plain-text, and mobile-friendly.",
].join(" ");

function isAgendaQuery(text: string): boolean {
  return [
    "what's on today",
    "whats on today",
    "what is on today",
    "today agenda",
    "my agenda",
    "agenda for today",
    "what do i have today",
    "what have i got today",
  ].some((phrase) => text.includes(phrase));
}

function isOpenTasksQuery(text: string): boolean {
  return [
    "open tasks",
    "my tasks",
    "what tasks do i have",
    "what personal tasks are open",
    "todo list",
    "to do list",
  ].some((phrase) => text.includes(phrase));
}

export class PersonalRouter {
  private readonly planner = new PersonalPlanner();
  private readonly reminders = new PersonalReminderService();
  private readonly journal = new PersonalJournalService();
  private readonly tasks = new PersonalTaskService();

  async route(msg: InboundMessage, text: string): Promise<PersonalRoute> {
    if (msg.channel !== "whatsapp") {
      return {
        kind: "prompt",
        message: text,
        systemPromptAddendum: "",
      };
    }

    const lowered = text.trim().toLowerCase();

    if (isAgendaQuery(lowered)) {
      return {
        kind: "reply",
        text: this.planner.getTodayAgendaText(),
      };
    }

    if (isOpenTasksQuery(lowered)) {
      return {
        kind: "reply",
        text: this.planner.getOpenPersonalTasksText(),
      };
    }

    const reminderReply = this.reminders.createFromNaturalLanguage(text);
    if (reminderReply) {
      return {
        kind: "reply",
        text: reminderReply,
      };
    }

    const journalReply = this.journal.captureFromNaturalLanguage(text);
    if (journalReply) {
      return {
        kind: "reply",
        text: journalReply,
      };
    }

    const taskReply = this.tasks.createFromNaturalLanguage(text);
    if (taskReply) {
      return {
        kind: "reply",
        text: taskReply,
      };
    }

    const intent = classifyIntent(text);
    if (intent === "technical-operator") {
      return {
        kind: "reply",
        text: [
          "I keep WhatsApp Pi in personal mode.",
          "For development, infrastructure, system changes, or technical debugging, please use Pi Console/TUI.",
          "If you want, I can still help here with reminders, tasks, journaling, or personal planning.",
        ].join(" "),
      };
    }

    return {
      kind: "prompt",
      message: text,
      systemPromptAddendum: PERSONAL_SYSTEM_PROMPT,
    };
  }
}
