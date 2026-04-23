{
  config,
  lib,
  ...
}: let
  cfg = config.nixpi;
in {
  options.nixpi = {
    user = {
      name = lib.mkOption {
        type = lib.types.str;
        default = "nixpi";
        description = ''
          Primary local username for NixPI services and user-scoped paths.
          Private fleet config should set this explicitly.
        '';
        example = "alex";
      };

      homeDirectory = lib.mkOption {
        type = lib.types.str;
        default = "/home/${cfg.user.name}";
        defaultText = lib.literalExpression ''"/home/${config.nixpi.user.name}"'';
        description = ''
          Home directory of the primary local NixPI user.
          Defaults to /home/<nixpi.user.name>.
        '';
        example = "/home/alex";
      };
    };

    root = lib.mkOption {
      type = lib.types.str;
      default = "${cfg.user.homeDirectory}/NixPI";
      description = ''
        Absolute path to the NixPI root directory.
        All other nixpi.* paths derive from this by default.
        Change this to relocate the entire NixPI workspace.
      '';
      example = "/home/your-user/NixPI";
    };

    repos = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = {
        nixpi-os = "${cfg.root}/repos/NixPI-OS";
        llm-wiki = "${cfg.root}/repos/NixPI-LLM-Wiki";
      };
      defaultText = lib.literalExpression ''
        {
          nixpi-os = "''${config.nixpi.root}/repos/NixPI-OS";
          llm-wiki = "''${config.nixpi.root}/repos/NixPI-LLM-Wiki";
        }
      '';
      description = ''
        Attribute set of absolute paths to public NixPI-Dev repos.
        Defaults derive from nixpi.root. Override individual entries
        to use local checkouts or different locations.
      '';
    };

    config = lib.mkOption {
      type = lib.types.str;
      default = "${cfg.root}/config";
      defaultText = lib.literalExpression ''"''${config.nixpi.root}/config"'';
      description = ''
        Absolute path to the private fleet configuration directory.
        This is the flake ref base for nixos-rebuild switch.
      '';
    };

    wiki = {
      technical = lib.mkOption {
        type = lib.types.str;
        default = "${cfg.root}/wiki/technical";
        defaultText = lib.literalExpression ''"''${config.nixpi.root}/wiki/technical"'';
        description = ''
          Absolute path to the technical wiki root.
          Domain: technical — OS, infrastructure, tools, decisions, evolution.
        '';
      };

      personal = lib.mkOption {
        type = lib.types.str;
        default = "${cfg.root}/wiki/personal";
        defaultText = lib.literalExpression ''"''${config.nixpi.root}/wiki/personal"'';
        description = ''
          Absolute path to the personal wiki root.
          Domain: personal — life organization, habits, career, people, daily notes.
        '';
      };
    };
  };
}
