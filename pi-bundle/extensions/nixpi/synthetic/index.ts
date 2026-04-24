import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readApiKey, syntheticStatus } from "./config.ts";
import { registerSyntheticProvider } from "./provider.ts";
import { registerSyntheticSearchTool } from "./search.ts";
import { buildSyntheticStatusLines } from "./status.ts";

export default function syntheticExtension(pi: ExtensionAPI) {
  const apiKey = readApiKey();
  const status = syntheticStatus(apiKey);

  if (apiKey) {
    registerSyntheticProvider(pi, apiKey);
    registerSyntheticSearchTool(pi);
  }

  pi.registerCommand("synthetic", {
    description: "Show Synthetic provider status and models",
    handler: async (_args, ctx) => {
      const lines = buildSyntheticStatusLines(readApiKey());
      if (ctx.hasUI) ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("synthetic", `synthetic: ${status === "ready" ? "ready" : "missing api key"}`);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus("synthetic", "");
  });
}
