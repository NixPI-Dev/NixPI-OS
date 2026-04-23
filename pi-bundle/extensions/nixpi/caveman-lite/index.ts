import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const STATE_ENTRY = "caveman-lite-enabled";
const STATUS_KEY = "caveman-lite";

const CAVEMAN_LITE_PROMPT = `CAVEMAN LITE ACTIVE.

Respond with concise, professional, technically precise language.

Rules:
- Remove filler, pleasantries, and hedging
- Keep full sentences and normal grammar
- Keep articles when they help readability
- Preserve technical accuracy and exact technical terms
- Prefer short, direct explanations and clear next steps
- Pattern: [thing] [action] [reason]. [next step]

Good: "Your component re-renders because you create a new object reference on each render. Wrap it in useMemo."
Bad: "Sure! I'd be happy to help. This is likely happening because you may be creating a new object reference during each render cycle."

Auto-clarity:
- Use normal clarity for security warnings, irreversible actions, and anything safety-critical
- Use normal prose for code, commits, pull requests, and tool call arguments
- If the user is confused or asks for more explanation, stay clear and direct rather than exaggeratedly terse`;

function syncStatus(ctx: Pick<ExtensionContext, "ui">, enabled: boolean) {
  ctx.ui.setStatus(STATUS_KEY, enabled ? "caveman-lite: on" : "caveman-lite: off");
}

export default function cavemanLite(pi: ExtensionAPI) {
  let enabled = true;

  pi.on("session_start", async (_event, ctx) => {
    enabled = true;

    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === STATE_ENTRY) {
        const value = (entry.data as { enabled?: boolean } | undefined)?.enabled;
        if (typeof value === "boolean") enabled = value;
      }
    }

    syncStatus(ctx, enabled);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    syncStatus(ctx, false);
  });

  pi.registerCommand("caveman", {
    description: "Toggle caveman-lite mode. Usage: /caveman [on|off|lite|status]",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim().toLowerCase();

      if (arg === "" || arg === "status") {
        ctx.ui.notify(`caveman-lite: ${enabled ? "on" : "off"}`, "info");
        syncStatus(ctx, enabled);
        return;
      }

      if (["on", "start", "lite"].includes(arg)) {
        enabled = true;
      } else if (["off", "stop", "normal"].includes(arg)) {
        enabled = false;
      } else {
        ctx.ui.notify('Unknown caveman mode. Use: /caveman on, /caveman off, /caveman lite, /caveman status', "error");
        return;
      }

      pi.appendEntry(STATE_ENTRY, { enabled });
      syncStatus(ctx, enabled);
      ctx.ui.notify(`caveman-lite: ${enabled ? "on" : "off"}. Takes effect on the next message.`, "info");
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${CAVEMAN_LITE_PROMPT}`,
    };
  });
}
