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
  for (const model of MODELS) {
    const vision = model.input.includes("image") ? " [vision]" : "";
    const thinking = model.reasoning ? " [reasoning]" : "";
    const cost = `$${model.cost.input}/${model.cost.output}`;
    lines.push(`  ${model.name}${vision}${thinking} — ${model.contextWindow.toLocaleString()} ctx, ${cost} per M tokens`);
  }

  return lines;
}
