{
  config,
  lib,
  ...
}: {
  options.pi = {
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
