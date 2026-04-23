{
  config,
  lib,
  ...
}: {
  options.nixpi = {
    root = lib.mkOption {
      type = lib.types.str;
      default = "${config.home.homeDirectory}/NixPI";
      description = "Absolute path to the NixPI root directory. Defaults from home.homeDirectory.";
    };

    repos = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = {
        nixpi-os = "${config.nixpi.root}/repos/NixPI-OS";
        llm-wiki = "${config.nixpi.root}/repos/NixPI-LLM-Wiki";
        caveman-lite = "${config.nixpi.root}/repos/NixPI-Caveman-Lite";
      };
      defaultText = lib.literalExpression "Derived from nixpi.root";
      description = "Absolute paths to NixPI-Dev repos. Set by NixOS nixpi-paths module.";
    };

    config = lib.mkOption {
      type = lib.types.str;
      default = "${config.nixpi.root}/config";
      defaultText = lib.literalExpression ''"''${config.nixpi.root}/config"'';
      description = "Absolute path to private fleet config directory. Set by NixOS nixpi-paths module.";
    };

    wiki = {
      technical = lib.mkOption {
        type = lib.types.str;
        default = "${config.nixpi.root}/wiki/technical";
        defaultText = lib.literalExpression ''"''${config.nixpi.root}/wiki/technical"'';
        description = "Absolute path to the technical wiki root. Set by NixOS nixpi-paths module.";
      };

      personal = lib.mkOption {
        type = lib.types.str;
        default = "${config.nixpi.root}/wiki/personal";
        defaultText = lib.literalExpression ''"''${config.nixpi.root}/wiki/personal"'';
        description = "Absolute path to the personal wiki root. Set by NixOS nixpi-paths module.";
      };
    };
  };
}
