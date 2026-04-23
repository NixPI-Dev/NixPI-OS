{
  config,
  lib,
  pkgs,
  ...
}: let
  enabledInstances = lib.filterAttrs (_: cfg: cfg.enable) config.services.llama-servers;

  makeServerArgs = cfg:
    [
      "--host ${cfg.host}"
      "--port ${toString cfg.port}"
      "--ctx-size ${toString cfg.contextSize}"
      "--n-gpu-layers ${toString cfg.nGpuLayers}"
      "--threads ${toString cfg.threads}"
      "--parallel ${toString cfg.parallel}"
    ]
    ++ lib.optionals (cfg.hfRepo != null && cfg.hfFile != null) [
      "--hf-repo ${cfg.hfRepo}"
      "--hf-file ${cfg.hfFile}"
    ]
    ++ lib.optionals (cfg.modelPath != null) [
      "--model ${cfg.modelPath}"
    ]
    ++ cfg.extraArgs;

  makeService = name: cfg: {
    description = "llama-server (${name}): OpenAI-compatible LLM inference";
    wantedBy = ["multi-user.target"];
    after = ["network.target"];

    environment =
      {
        HOME = "/var/lib/llama-server-${name}";
        HF_HOME = "/var/lib/llama-server-${name}/hf-cache";
        HUGGINGFACE_HUB_CACHE = "/var/lib/llama-server-${name}/hf-cache";
        LD_LIBRARY_PATH = "/run/opengl-driver/lib";
      }
      // cfg.environmentVariables;

    serviceConfig = {
      Type = "simple";
      User = "llama-server-${name}";
      Group = "llama-server-${name}";
      ExecStart = "${cfg.package}/bin/llama-server ${lib.concatStringsSep " " (makeServerArgs cfg)}";
      Restart = "on-failure";
      RestartSec = "10s";
      EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;
      StateDirectory = "llama-server-${name}";
      StateDirectoryMode = "0755";
      SupplementaryGroups = ["video" "render"];
      LimitNOFILE = "65536";
      LimitMEMLOCK = "infinity";
    };
  };

  instanceSubmodule = lib.types.submodule {
    options = {
      enable = lib.mkEnableOption "this llama-server instance";

      package = lib.mkOption {
        type = lib.types.package;
        default = pkgs.llama-cpp;
        defaultText = lib.literalExpression "pkgs.llama-cpp";
        description = ''
          The llama-cpp package to use. Override to select the acceleration backend:
            CUDA:   pkgs.llama-cpp.override { cudaSupport = true; }
            Vulkan: pkgs.llama-cpp.override { vulkanSupport = true; }
        '';
      };

      host = lib.mkOption {
        type = lib.types.str;
        default = "127.0.0.1";
        description = "Host address to bind the server to.";
      };

      port = lib.mkOption {
        type = lib.types.port;
        default = 8080;
        description = "Port to listen on.";
      };

      hfRepo = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "HuggingFace repository to download the model from on first start.";
      };

      hfFile = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "GGUF filename within the HuggingFace repository.";
      };

      modelPath = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Absolute path to a pre-downloaded GGUF model file.";
      };

      modelId = lib.mkOption {
        type = lib.types.str;
        default = "local-llama";
        description = ''
          Short identifier for this model, used by PI to reference it.
          Defaults to "local-llama"; set per-instance if you run multiple.
        '';
      };

      modelName = lib.mkOption {
        type = lib.types.str;
        default = "Local LLM (llama.cpp)";
        description = "Human-readable model name shown in PI's model selector.";
      };

      contextSize = lib.mkOption {
        type = lib.types.int;
        default = 32768;
        description = "Context window size in tokens.";
      };

      nGpuLayers = lib.mkOption {
        type = lib.types.int;
        default = 99;
        description = "Number of model layers to offload to GPU.";
      };

      threads = lib.mkOption {
        type = lib.types.int;
        default = 8;
        description = "Number of CPU threads used for non-GPU work.";
      };

      parallel = lib.mkOption {
        type = lib.types.int;
        default = 1;
        description = "Number of parallel inference slots.";
      };

      extraArgs = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Additional arguments passed directly to llama-server.";
      };

      environmentVariables = lib.mkOption {
        type = lib.types.attrsOf lib.types.str;
        default = {};
        description = "Extra environment variables injected into the service.";
      };

      environmentFile = lib.mkOption {
        type = lib.types.nullOr lib.types.path;
        default = null;
        description = "Path to a systemd EnvironmentFile (KEY=VALUE format).";
      };
    };
  };
in {
  options.services.llama-servers = lib.mkOption {
    type = lib.types.attrsOf instanceSubmodule;
    default = {};
    description = ''
      Named llama-server instances. Each entry generates an independent
      systemd service (llama-server-<name>), user, and state directory.
    '';
  };

  config = lib.mkIf (enabledInstances != {}) {
    assertions = lib.concatLists (lib.mapAttrsToList (name: cfg: [
        {
          assertion = (cfg.hfRepo != null) -> (cfg.modelPath == null);
          message = "services.llama-servers.${name}: cannot set both hfRepo and modelPath — choose HuggingFace download or local path.";
        }
        {
          assertion = (cfg.modelPath != null) -> (cfg.hfRepo == null);
          message = "services.llama-servers.${name}: cannot set both modelPath and hfRepo — choose local path or HuggingFace download.";
        }
        {
          assertion = cfg.hfRepo == null || cfg.hfFile != null;
          message = "services.llama-servers.${name}: hfFile must be set when hfRepo is set.";
        }
      ])
      enabledInstances);

    # Install the llama-cpp CLI system-wide so it's available on every host
    # that runs at least one llama-server instance.
    environment.systemPackages =
      map (i: i.package) (lib.attrValues enabledInstances);

    users.users = lib.mapAttrs' (name: _:
      lib.nameValuePair "llama-server-${name}" {
        isSystemUser = true;
        group = "llama-server-${name}";
        home = "/var/lib/llama-server-${name}";
        createHome = false;
        description = "llama-server-${name} service user";
      })
    enabledInstances;

    users.groups = lib.mapAttrs' (name: _:
      lib.nameValuePair "llama-server-${name}" {})
    enabledInstances;

    systemd.services = lib.mapAttrs' (name: cfg:
      lib.nameValuePair "llama-server-${name}" (makeService name cfg))
    enabledInstances;
  };
}
