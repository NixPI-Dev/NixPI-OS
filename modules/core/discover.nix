{
  config,
  lib,
  ...
}: let
  /*
  Auto-discover feature modules under modules/features/{nixos,home}/.

  Each feature directory that contains a module.nix is automatically registered:
    - modules/features/nixos/service-openssh/module.nix → flake.nixosModules.service-openssh
    - modules/features/home/git/module.nix              → flake.homeModules.git

  Directories without module.nix are silently skipped (e.g. placeholder dirs,
  asset-only directories like pi/skills, pi/extensions, etc.).
  */
  featureRoot = ../features;

  discover = dir:
    builtins.listToAttrs (
      lib.filter (attr: attr.value != null) (
        map (name: let
          path = dir + "/${name}";
        in {
          inherit name;
          value =
            if builtins.pathExists (path + "/module.nix")
            then import (path + "/module.nix")
            else null;
        }) (builtins.attrNames (builtins.readDir dir))
      )
    );
in {
  flake.nixosModules = discover (featureRoot + "/nixos");
  flake.homeModules = discover (featureRoot + "/home");
}
