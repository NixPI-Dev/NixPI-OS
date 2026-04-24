{
  config,
  lib,
  pkgs,
  ...
}: let
  piWebAccessRoot = "${pkgs.pi-web-access}/share/pi-web-access";
  piBundleRoot = ../../../../pi-bundle;

  technicalWikiDir = config.nixpi.wiki.technical;
  personalWikiDir = config.nixpi.wiki.personal;
  defaultWikiDir = technicalWikiDir;

  # Seed directory committed to the repo — provides the canonical structure on
  # fresh devices before Syncthing has had a chance to sync.
  # Strategy: [ -e "$dest" ] || cp "$src" "$dest"
  # Syncthing wins once it syncs; the seed only fills gaps.
  wikiSeed = piBundleRoot + "/wiki-seed";

  bundledPiExtensions = {
    nixpi = piBundleRoot + "/extensions/nixpi/nixpi";
    subagent = piBundleRoot + "/extensions/nixpi/subagent";
    zz-synthetic-search = piBundleRoot + "/extensions/nixpi/zz-synthetic-search";
  };

  starterConfig = builtins.toJSON {
    provider = "exa";
    workflow = "summary-review";
    curatorTimeoutSeconds = 20;
    githubClone = {
      enabled = true;
      maxRepoSizeMB = 350;
      cloneTimeoutSeconds = 30;
      clonePath = "/tmp/pi-github-repos";
    };
    youtube = {
      enabled = true;
      preferredModel = "gemini-3-flash-preview";
    };
    video = {
      enabled = true;
      preferredModel = "gemini-3-flash-preview";
      maxSizeMB = 50;
    };
    shortcuts = {
      curate = "ctrl+shift+s";
      activity = "ctrl+shift+w";
    };
  };

  # ── Local llama models — set per-host via pi.llamaModels ─────────────────
  llamaModels = config.pi.llamaModels;
  packageSources = config.pi.packageSources;

  # Build enabled model IDs for PI settings.json.
  syntheticModelIds = [
    "synthetic/hf:zai-org/GLM-5.1"
    "synthetic/hf:moonshotai/Kimi-K2.5"
    "synthetic/hf:MiniMaxAI/MiniMax-M2.5"
    "synthetic/hf:Qwen/Qwen3-Coder-480B-A35B-Instruct"
  ];

  llamaModelIds = map (m: "llama/${m.id}") llamaModels;
  hasLlama = llamaModels != [];

  syntheticProvider = {
    baseUrl = "https://api.synthetic.new/openai/v1";
    apiKey = "!cat ${config.pi.syntheticApiKeyFile}";
    api = "openai-completions";
    compat = {
      supportsDeveloperRole = false;
      supportsReasoningEffort = false;
    };
    models = [
      {
        id = "hf:zai-org/GLM-5.1";
        name = "GLM 5.1 (Synthetic)";
        reasoning = true;
        input = ["text"];
        contextWindow = 196608;
        maxTokens = 65536;
        cost = {
          input = 0;
          output = 0;
          cacheRead = 0;
          cacheWrite = 0;
        };
      }
      {
        id = "hf:moonshotai/Kimi-K2.5";
        name = "Kimi K2.5 (Synthetic)";
        reasoning = true;
        input = ["text" "image"];
        contextWindow = 262144;
        maxTokens = 65536;
        cost = {
          input = 0;
          output = 0;
          cacheRead = 0;
          cacheWrite = 0;
        };
      }
      {
        id = "hf:MiniMaxAI/MiniMax-M2.5";
        name = "MiniMax M2.5 (Synthetic)";
        reasoning = true;
        input = ["text"];
        contextWindow = 196608;
        maxTokens = 65536;
        cost = {
          input = 0;
          output = 0;
          cacheRead = 0;
          cacheWrite = 0;
        };
      }
      {
        id = "hf:Qwen/Qwen3-Coder-480B-A35B-Instruct";
        name = "Qwen3 Coder 480B A35B Instruct (Synthetic)";
        reasoning = true;
        input = ["text"];
        contextWindow = 262144;
        maxTokens = 65536;
        cost = {
          input = 0;
          output = 0;
          cacheRead = 0;
          cacheWrite = 0;
        };
      }
    ];
  };

  llamaProvider = {
    baseUrl = "http://127.0.0.1:8080/v1";
    apiKey = "local";
    api = "openai-completions";
    compat = {
      supportsDeveloperRole = false;
      supportsReasoningEffort = false;
      maxTokensField = "max_tokens";
    };
    models = llamaModels;
  };

  piModelsBase = {
    providers =
      {
        synthetic = syntheticProvider;
      }
      // lib.optionalAttrs hasLlama {
        llama = llamaProvider;
      };
  };

  piModelsBaseJson = pkgs.writeText "pi-models-base.json" (builtins.toJSON piModelsBase);

  # ── PI settings.json — fully declarative ──────────────────────────────────
  piSettings = {
    lastChangelogVersion = "0.67.68";
    defaultThinkingLevel = "high";
    hideThinkingBlock = true;
    defaultProvider = "synthetic";
    defaultModel = "hf:zai-org/GLM-5.1";
    enabledModels = syntheticModelIds ++ llamaModelIds;
    packages = packageSources;
    mcpServers = {
      qmd = {
        command = "qmd";
        args = ["mcp"];
      };
    };
  };

  piSettingsJson = pkgs.writeText "pi-settings.json" (builtins.toJSON piSettings);
in {
  # ── qmd — local retrieval layer ───────────────────────────────────────────
  home.file.".config/qmd/index.yml".text = ''
    global_context: >-
      Split knowledge system with two independent wiki roots.
      wiki-technical is for OS, infrastructure, tools, and decisions.
      wiki-personal is for life organization, habits, career, and people.
      Notes have stable ids, object_type, typed relation fields, and
      schema_version: 1. Choose the collection explicitly.

    collections:
      wiki-technical:
        path: ${technicalWikiDir}
        pattern: "pages/**/*.md"
        context:
          "/": "Technical wiki — OS, infrastructure, tools, decisions"
          "/pages/home": "Technical dashboards and navigation entry points"
          "/pages/planner": "Technical operational layer: tasks, calendar, reminders, reviews"
          "/pages/projects": "Technical projects and implementation tracks"
          "/pages/resources/technical": "Hosts, services, tools, infrastructure entities"
          "/pages/resources/knowledge": "Technical concepts and evergreen notes"
          "/pages/sources": "Technical research, captured evidence, ADR inputs"
      wiki-personal:
        path: ${personalWikiDir}
        pattern: "pages/**/*.md"
        context:
          "/": "Personal wiki — life organization, habits, career, people"
          "/pages/home": "Personal dashboards and navigation entry points"
          "/pages/planner": "Personal operational layer: tasks, calendar, reminders, reviews"
          "/pages/projects": "Life projects and finite personal outcomes"
          "/pages/areas": "Long-lived personal responsibilities and themes"
          "/pages/resources/people": "People objects and relationship context"
          "/pages/resources/knowledge": "Personal concepts and evergreen notes"
          "/pages/resources/personal": "Personal reference material"
          "/pages/sources": "Personal research and captured evidence"
  '';

  # ── PI config stubs ───────────────────────────────────────────────────────
  home.file.".pi/agent/prompts/.keep".text = "";
  home.file.".pi/agent/prompts/wiki.md".source = piBundleRoot + "/prompts/wiki.md";
  home.file.".pi/agent/skills/.keep".text = "";
  home.file.".pi/agent/themes/.keep".text = "";
  home.file.".pi/agent/agents/.keep".text = "";

  # ── PI extensions — in-house (NixPI-Dev) ─────────────────────────────────
  home.file.".pi/agent/extensions/nixpi".source = bundledPiExtensions.nixpi;
  home.file.".pi/agent/extensions/subagent".source = bundledPiExtensions.subagent;
  home.file.".pi/agent/extensions/zz-synthetic-search".source = bundledPiExtensions.zz-synthetic-search;

  # ── PI extensions — public/third-party (future) ──────────────────────────
  # Add home.file entries for public extensions under ./extensions/public/ here.

  # ── PI skills ─────────────────────────────────────────────────────────────
  home.file.".pi/agent/skills/wiki/SKILL.md".source = piBundleRoot + "/skills/wiki/SKILL.md";
  home.file.".pi/agent/skills/os-operations/SKILL.md".source = piBundleRoot + "/skills/os-operations/SKILL.md";
  home.file.".pi/agent/skills/self-evolution/SKILL.md".source = piBundleRoot + "/skills/self-evolution/SKILL.md";

  # ── PI subagents ──────────────────────────────────────────────────────────
  home.file.".pi/agent/agents/scout.md".source = piBundleRoot + "/agents/scout.md";
  home.file.".pi/agent/agents/planner.md".source = piBundleRoot + "/agents/planner.md";
  home.file.".pi/agent/agents/worker.md".source = piBundleRoot + "/agents/worker.md";
  home.file.".pi/agent/agents/reviewer.md".source = piBundleRoot + "/agents/reviewer.md";

  # ── Session variables ─────────────────────────────────────────────────────
  home.sessionVariables.PI_LLM_WIKI_DIR = defaultWikiDir;
  home.sessionVariables.PI_LLM_WIKI_DIR_TECHNICAL = technicalWikiDir;
  home.sessionVariables.PI_LLM_WIKI_DIR_PERSONAL = personalWikiDir;
  home.sessionVariables.PI_LLM_WIKI_ROOTS = "technical:${technicalWikiDir},personal:${personalWikiDir}";
  home.sessionVariables.PI_LLM_WIKI_ALLOWED_DOMAINS = "technical,personal";
  home.sessionVariables.PI_SYNTHETIC_API_KEY_FILE = config.pi.syntheticApiKeyFile;

  # ── Activation: PI web-search config (once) ───────────────────────────────
  home.activation.piWebAccessStarter = lib.hm.dag.entryAfter ["writeBoundary"] ''
    config_path="$HOME/.pi/web-search.json"
    if [ ! -e "$config_path" ]; then
      mkdir -p "$HOME/.pi"
      printf '%s\n' '${starterConfig}' > "$config_path"
    fi
  '';

  # ── Activation: PI settings — fully declarative ───────────────────────────
  #
  # settings.json is now regenerated from Nix config on every activation.
  # This ensures enabledModels, defaultModel, and mcpServers stay in sync
  # with the NixOS configuration.  User-only prefs (e.g. keybindings, UI
  # state) are preserved by merging the declarative fields into the
  # existing file rather than overwriting it entirely.
  home.activation.piSettings = lib.hm.dag.entryAfter ["writeBoundary"] ''
    settings_path="$HOME/.pi/agent/settings.json"
    mkdir -p "$(dirname "$settings_path")"

    if [ ! -e "$settings_path" ]; then
      # Fresh install — write the full declarative settings
      cp ${piSettingsJson} "$settings_path"
      chmod 0600 "$settings_path"
    else
      # Existing settings — merge declarative fields, preserving user prefs
      # like keybindings, hideThinkingBlock, etc. Package sources remain
      # declarative so PI extension installs can be pinned from Nix config.
      ${pkgs.jq}/bin/jq -n \
        --slurpfile decl ${piSettingsJson} \
        --slurpfile cur "$settings_path" \
        '$decl[0] as $d | $cur[0] as $c |
         $c * {
           enabledModels: $d.enabledModels,
           defaultProvider: $d.defaultProvider,
           defaultModel: $d.defaultModel,
           packages: $d.packages,
           mcpServers: ($c.mcpServers // {} | . + $d.mcpServers)
         }' \
        > "$settings_path.tmp" && mv "$settings_path.tmp" "$settings_path"
    fi
  '';

  # ── Activation: Pi custom providers/models (declarative) ─────────────────
  home.activation.piModels = lib.hm.dag.entryAfter ["writeBoundary"] ''
    models_path="$HOME/.pi/agent/models.json"
    mkdir -p "$(dirname "$models_path")"

    cp ${piModelsBaseJson} "$models_path.tmp"
    chmod 0600 "$models_path.tmp"
    mv "$models_path.tmp" "$models_path"
  '';

  # Remove retired runtime-managed files that are now declarative or obsolete.
  home.activation.piCavemanLiteCleanup = lib.hm.dag.entryAfter ["writeBoundary"] ''
    rm -rf "$HOME/.pi/agent/git/github.com/NixPI-Dev/NixPI-Caveman-Lite"
    rm -f "$HOME/.pi/agent/extensions/llm-wiki"
    rm -f "$HOME/.pi/agent/extensions/nixpi-permissions"
    rm -f "$HOME/.pi/agent/guardrails.yaml"
    rm -f "$HOME/.config/environment.d/90-synthetic-api-key.conf"
  '';

  # ── Activation: wiki seed (idempotent — never overwrites existing files) ──
  #
  # Each wiki root is seeded independently from wiki-seed/.
  # The [ -e "$dest" ] || cp guard ensures no file is ever overwritten.
  #
  home.activation.wikiStarter = lib.hm.dag.entryAfter ["writeBoundary"] ''
    seed='${wikiSeed}'

    seed_wiki_root() {
      wiki_root="$1"
      wiki_domain="$2"

      # Create directory skeleton (safe to run repeatedly)
      mkdir -p \
        "$wiki_root/.stfolder" \
        "$wiki_root/raw" \
        "$wiki_root/meta" \
        "$wiki_root/schemas" \
        "$wiki_root/templates/markdown" \
        "$wiki_root/pages/home" \
        "$wiki_root/pages/planner/tasks" \
        "$wiki_root/pages/planner/calendar" \
        "$wiki_root/pages/planner/reminders" \
        "$wiki_root/pages/planner/reviews" \
        "$wiki_root/pages/projects" \
        "$wiki_root/pages/projects/nixpi/persona" \
        "$wiki_root/pages/projects/nixpi/evolution" \
        "$wiki_root/pages/areas" \
        "$wiki_root/pages/resources/knowledge" \
        "$wiki_root/pages/resources/people" \
        "$wiki_root/pages/resources/technical" \
        "$wiki_root/pages/resources/personal" \
        "$wiki_root/pages/sources" \
        "$wiki_root/pages/journal/daily" \
        "$wiki_root/pages/journal/weekly" \
        "$wiki_root/pages/journal/monthly" \
        "$wiki_root/pages/archives/planner" \
        "$wiki_root/pages/archives/projects" \
        "$wiki_root/pages/archives/areas" \
        "$wiki_root/pages/archives/resources" \
        "$wiki_root/pages/archives/journal"

      # Seed files — only if the destination does not already exist. Prune
      # previously seeded cross-domain files only when they still match the
      # bundled seed exactly, so user-edited wiki pages are not removed.
      while IFS= read -r src; do
        rel="''${src#$seed/}"
        dest="$wiki_root/$rel"
        case "$rel" in
          meta/index.md|meta/log.md)
            continue
            ;;
          pages/*)
            if ! ${pkgs.gnugrep}/bin/grep -Eq "^domain: $wiki_domain$" "$src"; then
              if [ -e "$dest" ] && ${pkgs.diffutils}/bin/cmp -s "$src" "$dest"; then
                rm -f "$dest"
              fi
              continue
            fi
            ;;
        esac
        if [ ! -e "$dest" ]; then
          mkdir -p "$(dirname "$dest")"
          cp "$src" "$dest"
        fi
      done < <(find "$seed" -type f)

      # Seed an empty registry if none exists yet
      if [ ! -e "$wiki_root/meta/registry.json" ]; then
        printf '{"version":1,"generatedAt":"1970-01-01T00:00:00Z","pages":[]}\n' > "$wiki_root/meta/registry.json"
      fi
    }

    seed_wiki_root '${technicalWikiDir}' technical
    seed_wiki_root '${personalWikiDir}' personal
  '';

  # ── Update status timer — checks if NixPI repo is behind origin ────────
  systemd.user.services.nixpi-update-check = {
    Unit.Description = "NixPI repo update check";
    Service = {
      Type = "oneshot";
      ExecStart = let
        script = pkgs.writeShellApplication {
          name = "nixpi-update-check";
          runtimeInputs = [
            pkgs.coreutils
            pkgs.git
          ];
          text = ''
            set -euo pipefail
            repo="${config.nixpi.repos.nixpi-os}"
            status_file="${config.home.homeDirectory}/.pi/agent/update-status.json"
            mkdir -p "$(dirname "$status_file")"

            branch=$(git -C "$repo" branch --show-current 2>/dev/null || echo "main")
            git -C "$repo" fetch --quiet origin 2>/dev/null || true

            behind=$(git -C "$repo" rev-list "HEAD..origin/$branch" --count 2>/dev/null || echo "0")
            available="false"
            [ "$behind" -gt 0 ] && available="true"

            printf '{"available":%s,"behindBy":%s,"checked":"%s","branch":"%s","notified":false}\n' \
              "$available" "$behind" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$branch" \
              > "$status_file"
          '';
        };
      in "${script}/bin/nixpi-update-check";
    };
  };

  systemd.user.timers.nixpi-update-check = {
    Unit.Description = "NixPI repo update check timer";
    Timer = {
      OnBootSec = "5min";
      OnUnitActiveSec = "12h";
      Persistent = true;
    };
    Install.WantedBy = ["timers.target"];
  };
}
