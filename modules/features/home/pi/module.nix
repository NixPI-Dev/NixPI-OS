{
  config,
  lib,
  ...
}: {
  options.pi = {
    llamaModels = lib.mkOption {
      type = lib.types.listOf lib.types.attrs;
      default = [];
      description = ''
        Local llama-server model entries for PI's models.json and settings.json.
        Each entry must have: id, name, reasoning, input, contextWindow, maxTokens, cost.
        Set per-host to match the host's services.llama-servers configuration.
      '';
      example = lib.literalExpression ''
        [{
          id = "bartowski/Qwen_Qwen3.5-27B-GGUF";
          name = "Local Qwen 3.5 27B Dense (llama.cpp)";
          reasoning = false;
          input = ["text"];
          contextWindow = 131072;
          maxTokens = 8192;
          cost = { input = 0; output = 0; cacheRead = 0; cacheWrite = 0; };
        }]
      '';
    };

    nixpiExtensions = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = ''
        In-house NixPI extension package sources (NixPI-Dev org refs).
        These are published packages from the NixPI-Dev GitHub org,
        installed via PI's runtime package mechanism when not bundled
        as home.file declarations.
      '';
      example = lib.literalExpression ''
        [
          "git:github.com/NixPI-Dev/NixPI-Some-Future-Ext@v1.0.0"
        ]
      '';
    };

    publicExtensions = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = ''
        Public/third-party PI extension package sources.
        These are extensions from outside the NixPI-Dev org,
        installed via PI's runtime package mechanism.
      '';
      example = lib.literalExpression ''
        [
          "git:github.com/some-org/some-pi-extension@v2.0.0"
        ]
      '';
    };

    packageSources = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = config.pi.nixpiExtensions ++ config.pi.publicExtensions;
      description = ''
        Combined PI package sources for ~/.pi/agent/settings.json.
        Computed from nixpiExtensions and publicExtensions.
      '';
    };

    syntheticApiKeyFile = lib.mkOption {
      type = lib.types.str;
      default = "/run/secrets/synthetic_api_key";
      description = ''
        Runtime file path containing the Synthetic API key.
        Maintained hosts should provide this via sops-nix or another runtime
        secret mechanism so the key never enters the Nix store.
      '';
    };

    settingsOverrides = lib.mkOption {
      type = lib.types.attrs;
      default = {};
      description = ''
        Attribute overrides merged into the declarative PI settings.json.
        Use this for user-interface defaults that should be owned by Nix.
      '';
    };

    webAccessConfig = lib.mkOption {
      type = lib.types.attrs;
      default = {
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
      description = "Declarative contents of ~/.pi/web-search.json.";
    };

    wikiSeed.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Install and run the idempotent wiki seed user service. The service
        creates missing wiki directories and seed files, but never overwrites
        existing user-edited wiki content.
      '';
    };
  };

  imports = [
    ../nixpi-paths/module.nix
    ./resources.nix
  ];
}
