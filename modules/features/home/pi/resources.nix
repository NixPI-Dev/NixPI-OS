{
  config,
  lib,
  pkgs,
  ...
}: let
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
    synthetic = piBundleRoot + "/extensions/nixpi/synthetic";
  };

  packageSources = config.pi.packageSources;

  # Synthetic provider is registered dynamically by the synthetic
  # PI extension. models.json is no longer managed by Nix.

  wikiSeedCommand = pkgs.writeShellApplication {
    name = "nixpi-wiki-seed";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.diffutils
      pkgs.findutils
      pkgs.gnugrep
    ];
    text = ''
      set -euo pipefail

      seed=${lib.escapeShellArg (toString wikiSeed)}

      seed_wiki_root() {
        wiki_root="$1"
        wiki_domain="$2"

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

        while IFS= read -r src; do
          rel="''${src#"$seed"/}"
          dest="$wiki_root/$rel"
          case "$rel" in
            meta/index.md|meta/log.md)
              continue
              ;;
            pages/*)
              if ! grep -Eq "^domain: $wiki_domain$" "$src"; then
                if [ -e "$dest" ] && cmp -s "$src" "$dest"; then
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

        if [ ! -e "$wiki_root/meta/registry.json" ]; then
          printf '{"version":1,"generatedAt":"1970-01-01T00:00:00Z","pages":[]}\n' > "$wiki_root/meta/registry.json"
        fi
      }

      seed_wiki_root ${lib.escapeShellArg technicalWikiDir} technical
      seed_wiki_root ${lib.escapeShellArg personalWikiDir} personal
    '';
  };
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
  home.file.".pi/agent/extensions/synthetic".source = bundledPiExtensions.synthetic;

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

  # ── PI generated config ──────────────────────────────────────────────────
  # models.json is no longer managed by Nix — the synthetic extension
  # registers the provider dynamically at PI startup.

  # ── Session variables ─────────────────────────────────────────────────────
  home.sessionVariables.PI_LLM_WIKI_DIR = defaultWikiDir;
  home.sessionVariables.PI_LLM_WIKI_DIR_TECHNICAL = technicalWikiDir;
  home.sessionVariables.PI_LLM_WIKI_DIR_PERSONAL = personalWikiDir;
  home.sessionVariables.PI_LLM_WIKI_ROOTS = "technical:${technicalWikiDir},personal:${personalWikiDir}";
  home.sessionVariables.PI_LLM_WIKI_ALLOWED_DOMAINS = "technical,personal";
  home.sessionVariables.PI_SYNTHETIC_API_KEY_FILE = config.pi.syntheticApiKeyFile;

  # Remove retired runtime-managed files that are now declarative or obsolete.
  systemd.user.tmpfiles.rules = [
    "R %h/.pi/agent/git/github.com/NixPI-Dev/NixPI-Caveman-Lite - - - - -"
    "R %h/.pi/agent/extensions/llm-wiki - - - - -"
    "R %h/.pi/agent/extensions/nixpi-permissions - - - - -"
    "R %h/.pi/agent/guardrails.yaml - - - - -"
    "R %h/.pi/agent/extensions/zz-synthetic-search - - - - -"
    "R %h/.config/environment.d/90-synthetic-api-key.conf - - - - -"
  ];

  home.packages = [wikiSeedCommand];

  systemd.user.services.nixpi-wiki-seed = lib.mkIf config.pi.wikiSeed.enable {
    Unit.Description = "Seed missing NixPI wiki files";
    Service = {
      Type = "oneshot";
      ExecStart = "${wikiSeedCommand}/bin/nixpi-wiki-seed";
    };
    Install.WantedBy = ["default.target"];
  };

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
      OnActiveSec = "12h";
      OnUnitActiveSec = "12h";
      Persistent = true;
    };
    Install.WantedBy = ["timers.target"];
  };
}
