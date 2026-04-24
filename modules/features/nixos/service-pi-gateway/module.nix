{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.pi-gateway;
  gatewayPackage = pkgs.callPackage ../../../../pkgs/pi-gateway {};
  defaultWhatsAppModel = "hf:moonshotai/Kimi-K2.5";
  normalizeSyntheticModel = model: lib.removePrefix "synthetic/" model;
  whatsappTrustedNumbers = lib.unique (cfg.whatsapp.ownerNumbers ++ cfg.whatsapp.trustedNumbers);
  whatsappAdminNumbers = lib.unique (cfg.whatsapp.ownerNumbers ++ cfg.whatsapp.adminNumbers);
  whatsappAllowedModels = map normalizeSyntheticModel cfg.whatsapp.allowedModels;

  gatewayConfig = pkgs.writeText "nixpi-gateway.yml" (
    lib.generators.toYAML {} {
      gateway = {
        dbPath = "${cfg.stateDir}/gateway.db";
        sessionDir = "${cfg.stateDir}/sessions";
        maxReplyChars = cfg.maxReplyChars;
        maxReplyChunks = cfg.maxReplyChunks;
      };
      pi = {
        bin = cfg.piBin;
        cwd = cfg.cwd;
        timeoutMs = cfg.piTimeoutMs;
      };
      transports =
        lib.optionalAttrs cfg.signal.enable {
          signal = {
            enabled = true;
            account = cfg.signal.account;
            httpUrl = cfg.signal.httpUrl;
            allowedNumbers = cfg.signal.allowedNumbers;
            adminNumbers = cfg.signal.adminNumbers;
            directMessagesOnly = cfg.signal.directMessagesOnly;
          };
        }
        // lib.optionalAttrs cfg.whatsapp.enable {
          whatsapp = {
            enabled = true;
            trustedNumbers = whatsappTrustedNumbers;
            adminNumbers = whatsappAdminNumbers;
            directMessagesOnly = cfg.whatsapp.directMessagesOnly;
            sessionDataPath = cfg.whatsapp.sessionDataPath;
            model = cfg.whatsapp.model;
            allowedModels = cfg.whatsapp.allowedModels;
          };
        };
    }
  );
in {
  imports = [../nixpi-paths/module.nix];

  options.services.pi-gateway = {
    enable = lib.mkEnableOption "NixPI generic transport gateway";

    stateDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/nixpi-gateway";
      description = "Directory for gateway database, sessions, and runtime state.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "";
      description = "User account that runs the gateway (needs access to the pi binary and auth). Must be set when enable = true.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "";
      description = "Group for the gateway service. Must be set when enable = true.";
    };

    piBin = lib.mkOption {
      type = lib.types.str;
      default = "${pkgs.pi}/bin/pi";
      description = "Absolute path to the pi binary used to run prompts.";
    };

    cwd = lib.mkOption {
      type = lib.types.str;
      default = "";
      description = "Working directory for pi sessions. Must be set when enable = true.";
    };

    piTimeoutMs = lib.mkOption {
      type = lib.types.int;
      default = 300000;
      description = "Timeout in milliseconds for each pi prompt call.";
    };

    maxReplyChars = lib.mkOption {
      type = lib.types.int;
      default = 1400;
      description = "Maximum characters per reply chunk.";
    };

    maxReplyChunks = lib.mkOption {
      type = lib.types.int;
      default = 4;
      description = "Maximum number of reply chunks to send per message.";
    };

    technicalWikiDir = lib.mkOption {
      type = lib.types.str;
      default = config.nixpi.wiki.technical;
      defaultText = lib.literalExpression "config.nixpi.wiki.technical";
      description = "Technical wiki root exposed to Pi gateway sessions.";
    };

    personalWikiDir = lib.mkOption {
      type = lib.types.str;
      default = config.nixpi.wiki.personal;
      defaultText = lib.literalExpression "config.nixpi.wiki.personal";
      description = "Personal wiki root exposed to Pi gateway sessions and WhatsApp personal commands.";
    };

    syntheticApiKeyFile = lib.mkOption {
      type = lib.types.str;
      default = "/run/secrets/synthetic_api_key";
      description = "Runtime file containing the Synthetic API key for Pi prompts.";
    };

    extraReadWritePaths = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "Additional filesystem paths the gateway systemd service may write.";
    };

    signal = {
      enable = lib.mkEnableOption "Signal transport for pi-gateway";

      account = lib.mkOption {
        type = lib.types.str;
        description = "Signal account phone number in E.164 format (e.g. +15550001111).";
      };

      httpUrl = lib.mkOption {
        type = lib.types.str;
        default = "http://127.0.0.1:8080";
        description = "Base URL of the signal-cli-rest-api instance.";
      };

      allowedNumbers = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Phone numbers in E.164 format allowed to message Pi.";
      };

      adminNumbers = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Phone numbers with admin access (subset of allowedNumbers).";
      };

      directMessagesOnly = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "When true, only direct messages are handled (no group chats).";
      };
    };

    whatsapp = {
      enable = lib.mkEnableOption "WhatsApp transport for pi-gateway";

      ownerNumbers = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = ''
          WhatsApp phone numbers in E.164 format that are both trusted and
          admins. For a single-owner personal gateway, set only this option.
        '';
      };

      trustedNumbers = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Additional WhatsApp phone numbers in E.164 format allowed to message Pi.";
      };

      adminNumbers = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Additional WhatsApp phone numbers with admin access (subset of trustedNumbers plus ownerNumbers).";
      };

      directMessagesOnly = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "When true, only direct WhatsApp messages are handled (no group chats).";
      };

      sessionDataPath = lib.mkOption {
        type = lib.types.str;
        default = "${cfg.stateDir}/whatsapp/auth";
        description = "Directory used by the WhatsApp transport to persist Baileys auth state and QR artifacts.";
      };

      model = lib.mkOption {
        type = lib.types.str;
        default = defaultWhatsAppModel;
        example = "hf:moonshotai/Kimi-K2.5";
        description = ''
          Synthetic model used for every WhatsApp Pi prompt.
          Accepts either a bare Synthetic model id such as
          `hf:moonshotai/Kimi-K2.5` or the full Pi model selector form
          `synthetic/hf:moonshotai/Kimi-K2.5`.
        '';
      };

      allowedModels = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [defaultWhatsAppModel];
        example = [
          "hf:moonshotai/Kimi-K2.5"
          "hf:deepseek-ai/DeepSeek-V3.2"
        ];
        description = ''
          Synthetic model ids exposed to WhatsApp Pi sessions. The selected
          `services.pi-gateway.whatsapp.model` must be in this list.
        '';
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.enable -> cfg.user != "";
        message = "services.pi-gateway.user must be set when the gateway is enabled.";
      }
      {
        assertion = cfg.enable -> cfg.group != "";
        message = "services.pi-gateway.group must be set when the gateway is enabled.";
      }
      {
        assertion = cfg.enable -> cfg.cwd != "";
        message = "services.pi-gateway.cwd must be set when the gateway is enabled.";
      }
      {
        assertion = cfg.signal.enable -> cfg.signal.account != "";
        message = "services.pi-gateway.signal.account must be set when signal transport is enabled.";
      }
      {
        assertion = cfg.signal.enable -> cfg.signal.allowedNumbers != [];
        message = "services.pi-gateway.signal.allowedNumbers must not be empty when signal transport is enabled.";
      }
      {
        assertion = cfg.whatsapp.enable -> whatsappTrustedNumbers != [];
        message = "services.pi-gateway.whatsapp.ownerNumbers or trustedNumbers must not be empty when whatsapp transport is enabled.";
      }
      {
        assertion =
          cfg.whatsapp.enable
          -> lib.all (number: builtins.match "^\\+[0-9]+$" number != null) whatsappTrustedNumbers;
        message = "services.pi-gateway.whatsapp numbers must use E.164 format, e.g. +15550001111.";
      }
      {
        assertion =
          cfg.whatsapp.enable
          -> lib.all (number: builtins.elem number whatsappTrustedNumbers) whatsappAdminNumbers;
        message = "services.pi-gateway.whatsapp.adminNumbers must be included in ownerNumbers or trustedNumbers.";
      }
      {
        assertion =
          cfg.whatsapp.enable
          -> builtins.elem (normalizeSyntheticModel cfg.whatsapp.model) whatsappAllowedModels;
        message = "services.pi-gateway.whatsapp.model must be included in services.pi-gateway.whatsapp.allowedModels.";
      }
    ];

    systemd.tmpfiles.settings.pi-gateway =
      {
        "${cfg.stateDir}".d = {
          mode = "0750";
          user = cfg.user;
          group = cfg.group;
        };
        "${cfg.stateDir}/sessions".d = {
          mode = "0750";
          user = cfg.user;
          group = cfg.group;
        };
      }
      // lib.optionalAttrs cfg.whatsapp.enable {
        "${cfg.stateDir}/whatsapp".d = {
          mode = "0750";
          user = cfg.user;
          group = cfg.group;
        };
        "${cfg.stateDir}/whatsapp/auth".d = {
          mode = "0750";
          user = cfg.user;
          group = cfg.group;
        };
      };

    systemd.services.nixpi-gateway = {
      description = "NixPI generic transport gateway";
      after = ["network.target"];
      wantedBy = ["multi-user.target"];
      path = [pkgs.pi];
      environment = {
        HOME = "/home/${cfg.user}";
        XDG_CONFIG_HOME = "${cfg.stateDir}/xdg/config";
        XDG_CACHE_HOME = "${cfg.stateDir}/xdg/cache";
        PI_LLM_WIKI_DIR = cfg.technicalWikiDir;
        PI_LLM_WIKI_DIR_TECHNICAL = cfg.technicalWikiDir;
        PI_LLM_WIKI_DIR_PERSONAL = cfg.personalWikiDir;
        PI_LLM_WIKI_ROOTS = "technical:${cfg.technicalWikiDir},personal:${cfg.personalWikiDir}";
        PI_LLM_WIKI_ALLOWED_DOMAINS = "technical,personal";
        PI_LLM_WIKI_HOST = config.networking.hostName;
        PI_SYNTHETIC_API_KEY_FILE = cfg.syntheticApiKeyFile;
      };

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.cwd;
        ExecStart = "${gatewayPackage}/bin/nixpi-gateway ${gatewayConfig}";
        Restart = "on-failure";
        RestartSec = "10s";
        StandardOutput = "journal";
        StandardError = "journal";
        SyslogIdentifier = "nixpi-gateway";

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = "read-only";
        ReadWritePaths =
          [
            cfg.stateDir
            "/home/${cfg.user}/.pi"
          ]
          ++ lib.optionals cfg.signal.enable [cfg.technicalWikiDir]
          ++ lib.optionals cfg.whatsapp.enable [cfg.personalWikiDir]
          ++ cfg.extraReadWritePaths;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectKernelTunables = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        MemoryDenyWriteExecute = false; # node requires JIT
      };
    };
  };
}
