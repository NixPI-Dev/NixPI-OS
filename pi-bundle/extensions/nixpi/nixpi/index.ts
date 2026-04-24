import { StringEnum } from "@mariozechner/pi-ai";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { 
  EVOLUTION_AREAS,
  EVOLUTION_RISKS,
  EVOLUTION_STATUSES,
  NIXOS_UPDATE_ACTIONS,
  PROPOSAL_ACTIONS,
  SYSTEMD_ACTIONS,
} from "./constants.ts";
import {
  handleNixConfigProposal,
  handleNixosUpdate,
  handleScheduleReboot,
  handleSystemHealth,
  handleSystemdControl,
  handleUpdateStatus,
} from "./handlers.ts";
import registerPermissionsHooks from "./permissions.ts";
import { currentHostName, agentDir, evolutionDir, isPersonalGatewayProfile, systemFlakeDir } from "./shared.ts";
import { ensureEvolutionNote, readUpdateStatus, writeUpdateStatus } from "./state.ts";
import registerWikiExtension from "./wiki/index.ts";

export default function nixpiExtension(pi: ExtensionAPI) {
  registerPermissionsHooks(pi);
  registerWikiExtension(pi);

  if (isPersonalGatewayProfile()) {
    pi.on("session_start", async (_event, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.setStatus("nixpi", "NixPI WhatsApp personal mode");
      }
    });

    pi.on("before_agent_start", async (event) => {
      const note = "\n\n[WHATSAPP PERSONAL MODE]\nThis session is restricted to personal wiki, reminders, tasks, journal, agenda, and life management. NixPI host, OS, repository, shell, and deployment tools are intentionally not registered in this profile.";
      return { systemPrompt: event.systemPrompt + note };
    });

    return;
  }

  pi.registerTool({
    name: "nixpi_evolution_note",
    label: "NixPI Evolution Note",
    description: "Create or resolve a scoped evolution note under the Knowledge folder for NixPI changes.",
    promptSnippet: "Use nixpi_evolution_note to scaffold tracked self-evolution work before implementing significant PI/NixPI changes.",
    promptGuidelines: [
      "Create or resolve an evolution note before substantial PI runtime changes.",
      "Use concise titles and fill in summary, area, and risk when known.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Evolution note title." }),
      summary: Type.Optional(Type.String({ description: "One-line why/what summary." })),
      area: Type.Optional(StringEnum(EVOLUTION_AREAS, { description: "Primary evolution area." })),
      risk: Type.Optional(StringEnum(EVOLUTION_RISKS, { description: "Estimated change risk." })),
      status: Type.Optional(StringEnum(EVOLUTION_STATUSES, { description: "Lifecycle status." })),
    }),
    async execute(_toolCallId, params) {
      const result = await ensureEvolutionNote(params);
      return {
        content: [{ type: "text", text: `${result.created ? "Created" : "Resolved"} evolution note: ${result.path}` }],
        details: { ok: true, created: result.created, path: result.path },
      };
    },
  });

  pi.registerTool({
    name: "nixpi_status",
    label: "NixPI Status",
    description: "Show local NixPI runtime paths and extension state.",
    promptSnippet: "Use nixpi_status when the user asks about local NixPI runtime state.",
    parameters: Type.Object({}),
    async execute() {
      const host = currentHostName();
      const lines = [
        "NixPI runtime extension: active",
        `Host: ${host}`,
        `Agent dir: ${agentDir()}`,
        `Flake dir: ${systemFlakeDir()}`,
        `Evolution notes: ${evolutionDir()}`,
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { ok: true, agentDir: agentDir(), evolutionDir: evolutionDir() },
      };
    },
  });

  pi.registerTool({
    name: "update_status",
    label: "Update Status",
    description: "Read the NixPI update status — whether the local repo is behind its remote.",
    promptSnippet: "Use update_status to check whether there are upstream NixPI commits not yet pulled.",
    parameters: Type.Object({}),
    async execute() {
      return handleUpdateStatus();
    },
  });

  pi.registerTool({
    name: "nix_config_proposal",
    label: "Nix Config Proposal",
    description: "Inspect, validate, commit, push, and apply changes in the local NixPI host config repo.",
    promptSnippet: "Use nix_config_proposal to manage the NixPI repo lifecycle — status, validate, commit, push, apply.",
    promptGuidelines: [
      "Use action=status first to understand the working tree.",
      "Use action=validate before commit or apply.",
      "Use action=commit then action=push to publish changes.",
      "Use action=apply to rebuild the current host from the repo.",
      "Always confirm with the user before commit, push, or apply.",
    ],
    parameters: Type.Object({
      action: StringEnum(PROPOSAL_ACTIONS, {
        description: "status: repo state. validate: nix flake check. diff: working tree diff. commit: stage+commit. push: push branch. apply: nixos-rebuild switch.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return handleNixConfigProposal(pi, params.action, signal, ctx);
    },
  });

  pi.registerTool({
    name: "system_health",
    label: "System Health",
    description: "Composite health check: OS image status, containers, disk usage, system load, and memory.",
    promptSnippet: "Use system_health for a broad host snapshot before deeper diagnosis.",
    promptGuidelines: ["Run system_health first when the user asks about host state, health, or troubleshooting."],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      return handleSystemHealth(signal);
    },
  });

  pi.registerTool({
    name: "nixos_update",
    label: "NixOS Update Management",
    description: "Manage NixOS updates: list generations, apply the current host flake, or rollback to the previous generation.",
    promptSnippet: "Use nixos_update to inspect generations or rebuild/rollback the current host declaratively.",
    promptGuidelines: [
      "Use action=status before apply or rollback.",
      "apply runs sudo -n nixos-rebuild switch against ~/NixPI/host-configs/<current-host>#<current-host>.",
      "rollback runs sudo -n nixos-rebuild switch --rollback and requires confirmation.",
    ],
    parameters: Type.Object({
      action: StringEnum(NIXOS_UPDATE_ACTIONS, {
        description: "status: list generations. apply: rebuild current host. rollback: switch to previous generation.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return handleNixosUpdate(pi, params.action, signal, ctx);
    },
  });

  pi.registerTool({
    name: "schedule_reboot",
    label: "Schedule Reboot",
    description: "Schedule a system reboot after a delay in minutes.",
    promptSnippet: "Use schedule_reboot when a rebuild or maintenance flow needs a delayed restart with explicit confirmation.",
    promptGuidelines: [
      "Only use schedule_reboot after the user requests or approves a reboot.",
      "Prefer a short explicit delay like 1-5 minutes unless the user requests otherwise.",
    ],
    parameters: Type.Object({
      delay_minutes: Type.Number({ description: "Minutes to wait before rebooting", default: 1 }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return handleScheduleReboot(pi, params.delay_minutes, signal, ctx);
    },
  });

  pi.registerTool({
    name: "systemd_control",
    label: "Systemd Service Control",
    description: "Manage a small allowlisted set of services: nixpi-*, sshd, syncthing, and reaction.",
    promptSnippet: "Use systemd_control for safe service inspection and minimal remediation instead of ad-hoc shell service commands.",
    promptGuidelines: [
      "Prefer action=status first.",
      "Only use mutations after the user asks or agrees.",
    ],
    parameters: Type.Object({
      service: Type.String({ description: "Service name, for example sshd, syncthing, reaction, or a nixpi-* unit." }),
      action: StringEnum(SYSTEMD_ACTIONS, { description: "Systemd action to run." }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return handleSystemdControl(pi, params.service, params.action, signal, ctx);
    },
  });

  pi.registerCommand("nixpi", {
    description: "NixPI runtime status: /nixpi status | evolution <title>",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = parts[0] || "status";
      if (subcommand === "status") {
        const host = currentHostName();
        const lines = [
          "NixPI runtime extension: active",
          `Host: ${host}`,
          `Agent dir: ${agentDir()}`,
          `Flake dir: ${systemFlakeDir()}`,
          `Evolution notes: ${evolutionDir()}`,
        ];
        if (ctx.hasUI) ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (subcommand === "evolution") {
        const title = args.trim().replace(/^evolution\s+/, "").trim();
        if (!title) {
          if (ctx.hasUI) ctx.ui.notify("Usage: /nixpi evolution <title>", "warning");
          return;
        }
        const result = await ensureEvolutionNote({ title });
        if (ctx.hasUI) ctx.ui.notify(`${result.created ? "Created" : "Resolved"} evolution note: ${result.path}`, "info");
        return;
      }

      if (ctx.hasUI) ctx.ui.notify("Usage: /nixpi status | evolution <title>", "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus("nixpi", "NixPI runtime: active");
    }
  });

  pi.on("before_agent_start", async (event) => {
    const host = currentHostName();
    const flakeDir = systemFlakeDir();
    let note = `\n\n[OS CONTEXT]\nCurrent host: ${host}\nCanonical flake repo: ${flakeDir}\nUse system_health for diagnosis and nixos_update for declarative rebuilds.`;

    const updateStatus = readUpdateStatus();
    if (updateStatus?.available && !updateStatus.notified) {
      await writeUpdateStatus({ ...updateStatus, notified: true });
      note += `\n\n[UPDATE AVAILABLE] The NixPI repo is ${updateStatus.behindBy} commit(s) behind origin/${updateStatus.branch ?? "main"}. Inform the user and offer to pull and apply.`;
    }

    return { systemPrompt: event.systemPrompt + note };
  });
}
