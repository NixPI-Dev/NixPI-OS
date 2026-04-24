{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.nixpi.primaryUser;
  userName = config.nixpi.user.name;
  userHome = config.nixpi.user.homeDirectory;
  hasSops = builtins.hasAttr "sops" config && builtins.hasAttr "secrets" config.sops;
  hasHashedPassword = hasSops && builtins.hasAttr cfg.hashedPasswordSecretName config.sops.secrets;
in {
  imports = [../nixpi-paths/module.nix];

  options.nixpi.primaryUser = {
    enable = lib.mkEnableOption "the primary NixPI normal user" // {default = true;};

    description = lib.mkOption {
      type = lib.types.str;
      default = userName;
      description = "GECOS description for the primary NixPI user.";
    };

    extraGroups = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = ["wheel" "git"];
      description = "Supplementary groups for the primary NixPI user.";
    };

    authorizedKeys = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = "SSH public keys authorized for the primary NixPI user.";
    };

    shell = lib.mkOption {
      type = lib.types.package;
      default = pkgs.bashInteractive;
      description = "Login shell package for the primary NixPI user.";
    };

    requirePasswordSecret = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Require a sops-nix hashed password secret for the primary NixPI user.";
    };

    hashedPasswordSecretName = lib.mkOption {
      type = lib.types.str;
      default = "${userName}_hashed_password";
      defaultText = lib.literalExpression ''"''${config.nixpi.user.name}_hashed_password"'';
      description = "sops-nix secret name containing the user's hashed password.";
    };

    sudoNoPasswordCommands = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [
        "/run/current-system/sw/bin/nixos-rebuild"
        "/run/current-system/sw/bin/systemctl"
        "/run/current-system/sw/bin/nix-collect-garbage"
        "/run/wrappers/bin/reboot"
        "/run/wrappers/bin/poweroff"
      ];
      description = "Commands the primary user may run through sudo without a password.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !cfg.requirePasswordSecret || hasHashedPassword;
        message = "${cfg.hashedPasswordSecretName} must be provided through sops-nix; plaintext password fallback is disabled.";
      }
    ];

    users.users.${userName} =
      {
        isNormalUser = true;
        description = cfg.description;
        home = userHome;
        extraGroups =
          cfg.extraGroups
          ++ lib.optionals config.networking.networkmanager.enable ["networkmanager"];
        shell = cfg.shell;
        openssh.authorizedKeys.keys = cfg.authorizedKeys;
      }
      // lib.optionalAttrs hasHashedPassword {
        hashedPasswordFile = config.sops.secrets.${cfg.hashedPasswordSecretName}.path;
      };

    # Short global timestamp so sudo -n works across sessions.
    security.sudo.extraConfig = ''
      Defaults timestamp_type=global
      Defaults timestamp_timeout=1
    '';

    security.sudo.extraRules = [
      {
        users = [userName];
        commands =
          map (command: {
            inherit command;
            options = ["NOPASSWD"];
          })
          cfg.sudoNoPasswordCommands;
      }
    ];
  };
}
