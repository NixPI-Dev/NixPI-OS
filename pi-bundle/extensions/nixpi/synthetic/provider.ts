import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { REASONING_EFFORT_MAP, SYNTHETIC_BASE_URL } from "./config.ts";
import { MODELS } from "./models.ts";

export function registerSyntheticProvider(pi: ExtensionAPI, apiKey: string) {
  pi.registerProvider("synthetic", {
    baseUrl: SYNTHETIC_BASE_URL,
    apiKey,
    api: "openai-completions",
    models: MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: m.input,
      cost: m.cost,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        reasoningEffortMap: REASONING_EFFORT_MAP,
      },
    })),
  });
}
