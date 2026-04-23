{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.pi-gateway;
  gatewayPackage = pkgs.callPackage ../../../../pkgs/pi-gateway {};

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
            trustedNumbers = cfg.whatsapp.trustedNumbers;
            adminNumbers = cfg.whatsapp.adminNumbers;
            directMessagesOnly = cfg.whatsapp.directMessagesOnly;
            sessionDataPath = cfg.whatsapp.sessionDataPath;
          };
        };
    }
  );
in {
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

      trustedNumbers = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "WhatsApp phone numbers in E.164 format allowed to message Pi.";
      };

      adminNumbers = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "WhatsApp phone numbers with admin access (subset of trustedNumbers).";
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
        assertion = cfg.whatsapp.enable -> cfg.whatsapp.trustedNumbers != [];
        message = "services.pi-gateway.whatsapp.trustedNumbers must not be empty when whatsapp transport is enabled.";
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
      environment = lib.optionalAttrs cfg.whatsapp.enable {
        HOME = "/home/${cfg.user}";
        XDG_CONFIG_HOME = "${cfg.stateDir}/xdg/config";
        XDG_CACHE_HOME = "${cfg.stateDir}/xdg/cache";
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
        ReadWritePaths = [cfg.stateDir "/home/${cfg.user}/.pi"];
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
