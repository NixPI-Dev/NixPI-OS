import { allowedSyntheticModelIds } from "./config.ts";
import { MODELS } from "./models.ts";

export function buildSyntheticStatusLines(apiKey: string | null): string[] {
  const lines = [
    `Synthetic provider: ${apiKey ? "registered" : "unavailable"}`,
    `API key: ${apiKey ? "present" : "missing"}`,
  ];

  if (!apiKey) {
    lines.push("Reason: no readable Synthetic API key was found in the configured runtime secret paths.");
    return lines;
  }

  lines.push("");
  lines.push("Models:");
  const allowedIds = allowedSyntheticModelIds();
  const models = allowedIds ? MODELS.filter((model) => allowedIds.includes(model.id)) : MODELS;
  if (allowedIds) lines.push(`Allowlist: ${allowedIds.join(", ")}`);
  for (const model of models) {
    const vision = model.input.includes("image") ? " [vision]" : "";
    const thinking = model.reasoning ? " [reasoning]" : "";
    const cost = `$${model.cost.input}/${model.cost.output}`;
    lines.push(`  ${model.name}${vision}${thinking} — ${model.contextWindow.toLocaleString()} ctx, ${cost} per M tokens`);
  }

  return lines;
}
