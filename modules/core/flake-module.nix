{
  config,
  lib,
  ...
}: {
  options.flake.homeModules = lib.mkOption {
    type = lib.types.lazyAttrsOf lib.types.raw;
    default = {};
    description = "Composable exported Home Manager modules.";
  };

  imports = [./discover.nix];
}
