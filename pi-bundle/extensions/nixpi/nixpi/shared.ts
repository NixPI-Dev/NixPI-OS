import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function agentDir() {
  return join(process.env.HOME || "/tmp", ".pi", "agent");
}

export function knowledgeDir() {
  return join(process.env.HOME || "/tmp", "NixPI", "wiki", "technical");
}

export function evolutionDir() {
  return join(knowledgeDir(), "pages", "projects", "nixpi", "evolution");
}

export function currentHostName() {
  if (process.env.HOSTNAME) return process.env.HOSTNAME;
  try {
    return readFileSync("/etc/hostname", "utf-8").trim();
  } catch {
    return "nixos";
  }
}

export function systemFlakeDir() {
  return join(process.env.HOME || "/home/alex", "NixPI", "host-configs", currentHostName());
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function truncate(text: string) {
  return text.length > 50_000 ? `${text.slice(0, 50_000)}\n... [truncated]` : text;
}

export function isPersonalGatewayProfile() {
  return process.env.PI_GATEWAY_PROFILE === "whatsapp-personal";
}

export function atomicWriteText(filePath: string, content: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}

export async function confirm(ctx: any, action: string) {
  if (!ctx.hasUI) return `Cannot perform "${action}" without interactive confirmation.`;
  const ok = await ctx.ui.confirm("Confirm action", `Allow: ${action}?`);
  return ok ? null : `User declined: ${action}`;
}

export async function run(cmd: string, args: string[], signal?: AbortSignal, cwd?: string) {
  try {
    const result = await execFileAsync(cmd, args, {
      signal,
      cwd,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: typeof error.code === "number" ? error.code : 1,
    };
  }
}
