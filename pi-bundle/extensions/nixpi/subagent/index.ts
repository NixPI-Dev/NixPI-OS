import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import type { Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { discoverAgents, type AgentConfig, type AgentScope } from "./agents.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const CURRENT_MODEL_SENTINEL = "current";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface SingleResult {
  agent: string;
  agentSource: "user" | "project" | "unknown";
  task: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
}

interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  agentScope: AgentScope;
  projectAgentsDir: string | null;
  inheritedModel?: string;
  inheritedThinking?: ThinkingLevel;
  results: SingleResult[];
}

function emptyUsage(): UsageStats {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    for (const part of msg.content) {
      if (part.type === "text") return part.text;
    }
  }
  return "";
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };
  return { command: "pi", args };
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;

  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
  await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

function currentModelArg(model: { provider: string; id: string } | undefined): string | undefined {
  return model ? `${model.provider}/${model.id}` : undefined;
}

function resolveModelArg(options: {
  requestedModel?: string;
  agentModel?: string;
  inheritedModel?: string;
}): string | undefined {
  const candidates = [options.requestedModel, options.agentModel, options.inheritedModel];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.trim();
    if (!normalized || normalized === CURRENT_MODEL_SENTINEL) continue;
    return normalized;
  }
  return options.inheritedModel;
}

function preview(text: string, max = 160): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "(no output)";
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function summarizeResult(result: SingleResult): string {
  const text = result.errorMessage || result.stderr || getFinalOutput(result.messages);
  return preview(text || "(no output)");
}

type SubagentInput = {
  agent?: string;
  task?: string;
  model?: string;
  cwd?: string;
  tasks?: Array<{ agent: string; task: string; model?: string; cwd?: string }>;
  chain?: Array<{ agent: string; task: string; model?: string; cwd?: string }>;
  agentScope?: AgentScope;
  confirmProjectAgents?: boolean;
};

function requestedAgentNames(params: SubagentInput): string[] {
  const names = new Set<string>();
  if (params.agent) names.add(params.agent);
  for (const task of params.tasks ?? []) names.add(task.agent);
  for (const task of params.chain ?? []) names.add(task.agent);
  return Array.from(names);
}

function hasRequestedAgentModel(params: SubagentInput, agents: AgentConfig[]): boolean {
  const names = requestedAgentNames(params);
  return names.some((name) => {
    const agent = agents.find((entry) => entry.name === name);
    return Boolean(agent?.model && agent.model !== CURRENT_MODEL_SENTINEL);
  });
}

function discoveryHint(scope: AgentScope, projectAgentsDir: string | null): string {
  const userHint = "User agents live in ~/.pi/agent/agents/*.md";
  const projectHint = projectAgentsDir
    ? `Project agents live in ${projectAgentsDir}/*.md`
    : "Project agents live in the nearest .pi/agents/*.md under the current working tree";

  if (scope === "user") return userHint;
  if (scope === "project") return projectHint;
  return `${userHint}. ${projectHint}.`;
}

function parseAgentScopeArg(input: string): AgentScope {
  const normalized = input.trim().toLowerCase();
  if (normalized === "project") return "project";
  if (normalized === "both") return "both";
  return "user";
}

function formatAgentList(agents: AgentConfig[], scope: AgentScope, projectAgentsDir: string | null): string {
  if (agents.length === 0) {
    return `No agents found for scope "${scope}". ${discoveryHint(scope, projectAgentsDir)}`;
  }

  const lines = [`Agents (${scope}):`];
  for (const agent of agents) {
    const tools = agent.tools?.length ? ` tools=[${agent.tools.join(", ")}]` : "";
    const model = agent.model && agent.model !== CURRENT_MODEL_SENTINEL ? ` model=${agent.model}` : "";
    lines.push(`- ${agent.name} (${agent.source}) — ${agent.description}${tools}${model}`);
  }
  if (scope !== "user") {
    lines.push("");
    lines.push(discoveryHint(scope, projectAgentsDir));
  }
  return lines.join("\n");
}

type RunContext = {
  cwd: string;
  inheritedModel?: string;
  inheritedThinking?: ThinkingLevel;
};

type TaskConfig = {
  agent: string;
  task: string;
  cwd?: string;
  model?: string;
};

type OnUpdateCallback = (details: SubagentDetails, summaryText: string) => void;

async function runSingleAgent(
  runContext: RunContext,
  agents: AgentConfig[],
  taskConfig: TaskConfig,
  mode: "single" | "parallel" | "chain",
  makeDetails: (results: SingleResult[]) => SubagentDetails,
  signal?: AbortSignal,
  onUpdate?: OnUpdateCallback,
  step?: number,
): Promise<SingleResult> {
  const agent = agents.find((entry) => entry.name === taskConfig.agent);
  if (!agent) {
    const available = agents.map((entry) => `"${entry.name}"`).join(", ") || "none";
    return {
      agent: taskConfig.agent,
      agentSource: "unknown",
      task: taskConfig.task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown agent: "${taskConfig.agent}". Available agents: ${available}.`,
      usage: emptyUsage(),
      step,
    };
  }

  const effectiveModel = resolveModelArg({
    requestedModel: taskConfig.model,
    agentModel: agent.model,
    inheritedModel: runContext.inheritedModel,
  });

  const args: string[] = ["--mode", "json", "-p", "--no-session"];
  if (effectiveModel) args.push("--model", effectiveModel);
  if (runContext.inheritedThinking) args.push("--thinking", runContext.inheritedThinking);
  if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

  const result: SingleResult = {
    agent: taskConfig.agent,
    agentSource: agent.source,
    task: taskConfig.task,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
    model: effectiveModel,
    step,
  };

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  const emitUpdate = () => {
    if (!onUpdate) return;
    onUpdate(makeDetails([result]), getFinalOutput(result.messages) || "(running...)");
  };

  try {
    if (agent.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }

    args.push(`Task: ${taskConfig.task}`);
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: taskConfig.cwd ?? runContext.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";
      const processLine = (line: string) => {
        if (!line.trim()) return;

        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message) {
          const message = event.message as Message;
          result.messages.push(message);

          if (message.role === "assistant") {
            result.usage.turns += 1;
            const usage = message.usage;
            if (usage) {
              result.usage.input += usage.input || 0;
              result.usage.output += usage.output || 0;
              result.usage.cacheRead += usage.cacheRead || 0;
              result.usage.cacheWrite += usage.cacheWrite || 0;
              result.usage.cost += usage.cost?.total || 0;
              result.usage.contextTokens = usage.totalTokens || 0;
            }
            if (!result.model && message.model) result.model = message.model;
            if (message.stopReason) result.stopReason = message.stopReason;
            if (message.errorMessage) result.errorMessage = message.errorMessage;
          }
          emitUpdate();
        }

        if (event.type === "tool_result_end" && event.message) {
          result.messages.push(event.message as Message);
          emitUpdate();
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        result.stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });

      proc.on("error", () => resolve(1));

      if (signal) {
        const killProc = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5000);
        };

        if (signal.aborted) killProc();
        else signal.addEventListener("abort", killProc, { once: true });
      }
    });

    result.exitCode = exitCode;
    if (wasAborted) throw new Error(`${mode} subagent was aborted`);
    return result;
  } finally {
    if (tmpPromptPath) {
      try {
        fs.unlinkSync(tmpPromptPath);
      } catch {
        // ignore
      }
    }
    if (tmpPromptDir) {
      try {
        fs.rmdirSync(tmpPromptDir);
      } catch {
        // ignore
      }
    }
  }
}

const AgentScopeSchema = Type.Optional(
  StringEnum(["user", "project", "both"] as const, {
    description: 'Which agent directories to use. Default: "user". Use "both" to include project-local .pi/agents.',
    default: "user",
  }),
);

const TaskItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke." }),
  task: Type.String({ description: "Task to delegate to the agent." }),
  model: Type.Optional(Type.String({ description: "Optional Pi model override. Omit to inherit the current Pi model." })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent process." })),
});

const SubagentParams = Type.Object({
  agent: Type.Optional(Type.String({ description: "Name of the agent to invoke for single mode." })),
  task: Type.Optional(Type.String({ description: "Task to delegate for single mode." })),
  model: Type.Optional(Type.String({ description: "Optional Pi model override for single mode." })),
  cwd: Type.Optional(Type.String({ description: "Working directory for single mode." })),
  tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of independent tasks for parallel execution." })),
  chain: Type.Optional(Type.Array(TaskItem, { description: "Array of sequential tasks. Use {previous} to inject prior output." })),
  agentScope: AgentScopeSchema,
  confirmProjectAgents: Type.Optional(
    Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
  ),
});

export default function subagentExtension(pi: ExtensionAPI) {
  if (process.env.PI_GATEWAY_PROFILE === "whatsapp-personal") return;

  pi.registerCommand("agents", {
    description: "List available subagents. Usage: /agents [user|project|both]",
    handler: async (args, ctx) => {
      const scope = parseAgentScopeArg(args || "user");
      const discovery = discoverAgents(ctx.cwd, scope);
      const text = formatAgentList(discovery.agents, scope, discovery.projectAgentsDir);
      if (ctx.hasUI) ctx.ui.notify(text, "info");
    },
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Delegate tasks to isolated Pi subprocesses. Supports single, parallel, and chain execution. Agents inherit the current Pi model and thinking level by default, with optional per-task model overrides.",
    promptSnippet: "Use subagent for isolated single, parallel, or chained helper agents that inherit the current Pi model by default.",
    promptGuidelines: [
      "Use subagent when independent tasks can run in parallel or when a scout/planner/reviewer flow would keep context cleaner.",
      "Do not hardcode providers in subagent calls; rely on the current Pi model unless a specific model override is necessary.",
    ],
    parameters: SubagentParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const agentScope: AgentScope = params.agentScope ?? "user";
      const discovery = discoverAgents(ctx.cwd, agentScope);
      const agents = discovery.agents;
      const inheritedModel = currentModelArg(ctx.model as { provider: string; id: string } | undefined);
      const inheritedThinking = pi.getThinkingLevel() as ThinkingLevel;
      const runContext: RunContext = { cwd: ctx.cwd, inheritedModel, inheritedThinking };
      const confirmProjectAgents = params.confirmProjectAgents ?? true;

      const hasSingle = Boolean(params.agent && params.task);
      const hasParallel = (params.tasks?.length ?? 0) > 0;
      const hasChain = (params.chain?.length ?? 0) > 0;
      const modeCount = Number(hasSingle) + Number(hasParallel) + Number(hasChain);

      const makeDetails =
        (mode: "single" | "parallel" | "chain") =>
        (results: SingleResult[]): SubagentDetails => ({
          mode,
          agentScope,
          projectAgentsDir: discovery.projectAgentsDir,
          inheritedModel,
          inheritedThinking,
          results,
        });

      if (agents.length === 0) {
        return {
          content: [{ type: "text", text: `No agents found for scope \"${agentScope}\". ${discoveryHint(agentScope, discovery.projectAgentsDir)}` }],
          details: makeDetails("single")([]),
          isError: true,
        };
      }

      if (modeCount !== 1) {
        const available = agents.map((entry) => `${entry.name} (${entry.source})`).join(", ") || "none";
        return {
          content: [{ type: "text", text: `Invalid parameters. Provide exactly one mode. Available agents: ${available}` }],
          details: makeDetails("single")([]),
          isError: true,
        };
      }

      const modelAvailable = Boolean(
        inheritedModel ||
          params.model ||
          params.tasks?.some((task) => task.model) ||
          params.chain?.some((task) => task.model) ||
          hasRequestedAgentModel(params, agents),
      );

      if (!modelAvailable) {
        return {
          content: [{ type: "text", text: "No active Pi model is available for subagent inheritance. Pick a model with /model or pass a model override in the subagent call." }],
          details: makeDetails(hasChain ? "chain" : hasParallel ? "parallel" : "single")([]),
          isError: true,
        };
      }

      if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI) {
        const requestedAgents = new Set<string>();
        if (params.agent) requestedAgents.add(params.agent);
        for (const task of params.tasks ?? []) requestedAgents.add(task.agent);
        for (const task of params.chain ?? []) requestedAgents.add(task.agent);

        const projectAgents = Array.from(requestedAgents)
          .map((name) => agents.find((entry) => entry.name === name))
          .filter((entry): entry is AgentConfig => entry?.source === "project");

        if (projectAgents.length > 0) {
          const ok = await ctx.ui.confirm(
            "Run project-local agents?",
            `Agents: ${projectAgents.map((entry) => entry.name).join(", ")}\nSource: ${discovery.projectAgentsDir ?? "(unknown)"}\n\nProject agents are repo-controlled. Continue only for trusted repositories.`,
          );
          if (!ok) {
            return {
              content: [{ type: "text", text: "Cancelled: project-local agents were not approved." }],
              details: makeDetails(hasChain ? "chain" : hasParallel ? "parallel" : "single")([]),
            };
          }
        }
      }

      if (hasSingle && params.agent && params.task) {
        const result = await runSingleAgent(
          runContext,
          agents,
          { agent: params.agent, task: params.task, model: params.model, cwd: params.cwd },
          "single",
          makeDetails("single"),
          signal,
          onUpdate ? (details, summaryText) => onUpdate({ content: [{ type: "text", text: summaryText }], details }) : undefined,
        );

        const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
        if (isError) {
          const errorText = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
          return {
            content: [{ type: "text", text: `Subagent failed: ${errorText}` }],
            details: makeDetails("single")([result]),
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: getFinalOutput(result.messages) || "(no output)" }],
          details: makeDetails("single")([result]),
        };
      }

      if (hasParallel && params.tasks) {
        if (params.tasks.length > MAX_PARALLEL_TASKS) {
          return {
            content: [{ type: "text", text: `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.` }],
            details: makeDetails("parallel")([]),
            isError: true,
          };
        }

        const allResults: SingleResult[] = params.tasks.map((task) => ({
          agent: task.agent,
          agentSource: "unknown",
          task: task.task,
          exitCode: -1,
          messages: [],
          stderr: "",
          usage: emptyUsage(),
          model: resolveModelArg({ requestedModel: task.model, inheritedModel }),
        }));

        const emitParallelUpdate = () => {
          if (!onUpdate) return;
          const done = allResults.filter((entry) => entry.exitCode !== -1).length;
          const running = allResults.length - done;
          onUpdate({
            content: [{ type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` }],
            details: makeDetails("parallel")([...allResults]),
          });
        };

        const results = await mapWithConcurrencyLimit(params.tasks, MAX_CONCURRENCY, async (task, index) => {
          const result = await runSingleAgent(
            runContext,
            agents,
            task,
            "parallel",
            makeDetails("parallel"),
            signal,
            onUpdate
              ? (details) => {
                  const currentResult = details.results[0];
                  if (currentResult) {
                    allResults[index] = currentResult;
                    emitParallelUpdate();
                  }
                }
              : undefined,
          );
          allResults[index] = result;
          emitParallelUpdate();
          return result;
        });

        const successCount = results.filter((entry) => entry.exitCode === 0).length;
        const lines = results.map((entry) => {
          const status = entry.exitCode === 0 ? "ok" : "error";
          return `[${entry.agent}] ${status}: ${summarizeResult(entry)}`;
        });
        return {
          content: [{ type: "text", text: `Parallel: ${successCount}/${results.length} succeeded\n\n${lines.join("\n")}` }],
          details: makeDetails("parallel")(results),
          isError: successCount !== results.length,
        };
      }

      if (hasChain && params.chain) {
        const results: SingleResult[] = [];
        let previousOutput = "";

        for (let index = 0; index < params.chain.length; index++) {
          const task = params.chain[index];
          const expandedTask = { ...task, task: task.task.replace(/\{previous\}/g, previousOutput) };
          const result = await runSingleAgent(
            runContext,
            agents,
            expandedTask,
            "chain",
            makeDetails("chain"),
            signal,
            onUpdate
              ? (details, summaryText) => {
                  const current = details.results[0];
                  if (!current) return;
                  onUpdate({
                    content: [{ type: "text", text: summaryText }],
                    details: makeDetails("chain")([...results, current]),
                  });
                }
              : undefined,
            index + 1,
          );
          results.push(result);

          const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
          if (isError) {
            const errorText = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
            return {
              content: [{ type: "text", text: `Chain stopped at step ${index + 1} (${task.agent}): ${errorText}` }],
              details: makeDetails("chain")(results),
              isError: true,
            };
          }

          previousOutput = getFinalOutput(result.messages);
        }

        return {
          content: [{ type: "text", text: getFinalOutput(results[results.length - 1].messages) || "(no output)" }],
          details: makeDetails("chain")(results),
        };
      }

      return {
        content: [{ type: "text", text: "Invalid subagent invocation." }],
        details: makeDetails("single")([]),
        isError: true,
      };
    },
  });
}
