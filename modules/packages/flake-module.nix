{inputs, ...}: let
  mkQmd = pkgs: system:
    inputs.qmd.packages.${system}.default.overrideAttrs (_old: {
      postFixup = ''
        substituteInPlace $out/bin/qmd \
          --replace-fail "export DYLD_LIBRARY_PATH='${pkgs.sqlite.out}/lib'" "export DYLD_LIBRARY_PATH='${pkgs.lib.makeLibraryPath [pkgs.sqlite pkgs.stdenv.cc.cc.lib]}'" \
          --replace-fail "export LD_LIBRARY_PATH='${pkgs.sqlite.out}/lib'" "export LD_LIBRARY_PATH='${pkgs.lib.makeLibraryPath [pkgs.sqlite pkgs.stdenv.cc.cc.lib]}'"
      '';
    });
in {
  perSystem = {
    pkgs,
    system,
    ...
  }: let
    nixpi-vcp = pkgs.writeShellApplication {
      name = "nixpi-vcp";
      runtimeInputs = [pkgs.git pkgs.nix pkgs.coreutils];
      text = ''
        set -euo pipefail

        repo_root="$(git rev-parse --show-toplevel)"
        cd "$repo_root"

        echo "== git status =="
        git status --short
        echo

        if git diff --quiet && git diff --cached --quiet; then
          echo "No changes to validate/commit/push."
          exit 0
        fi

        echo "== nix flake check =="
        nix flake check
        echo

        echo "== git add -A =="
        git add -A

        if git diff --cached --quiet; then
          echo "Nothing staged after git add -A."
          exit 0
        fi

        message="''${*:-Update NixPI — $(date +%F)}"

        echo "== git commit =="
        git commit -m "$message"
        echo

        echo "== git push =="
        git push
      '';
    };
  in {
    _module.args.pkgs = import inputs.nixpkgs {
      inherit system;
      overlays = [
        inputs.llm-agents.overlays.default
        (final: _prev: {
          pi = final.callPackage ../../pkgs/pi {};
          pi-web-access = final.callPackage ../../pkgs/pi-web-access {};
          llm-wiki = final.callPackage ../../pkgs/llm-wiki {};
          pi-gateway = final.callPackage ../../pkgs/pi-gateway {};
          qmd = mkQmd final system;
        })
      ];
    };

    formatter = pkgs.writeShellApplication {
      name = "nixfmt";
      runtimeInputs = [pkgs.alejandra];
      text = ''
        if [ "$#" -eq 0 ]; then
          find . -type f -name '*.nix' -writable -print0 | xargs -0 alejandra
          exit 0
        fi

        exec alejandra "$@"
      '';
    };

    devShells.default = pkgs.mkShellNoCC {
      packages = with pkgs; [
        alejandra
        deadnix
        nodejs
        statix
      ];
    };

    packages = {
      pi = pkgs.pi;
      pi-web-access = pkgs.pi-web-access;
      llm-wiki = pkgs.llm-wiki;
      llm-wiki-tests = pkgs.callPackage ../../pkgs/llm-wiki/tests.nix {};
      pi-gateway = pkgs.pi-gateway;
      qmd = pkgs.qmd;
      nixpi-vcp = nixpi-vcp;
      default = pkgs.pi;
    };

    apps = let
      mkApp = package: {
        type = "app";
        program = "${package}/bin/${package.meta.mainProgram or package.name}";
        meta.description = package.meta.description or package.name;
      };

      piApp = mkApp pkgs.pi;
      nixpiVcpApp = mkApp nixpi-vcp;
    in {
      pi = piApp;
      nixpi-vcp = nixpiVcpApp;
      default = piApp;
    };
  };

  flake.overlays.default = final: prev:
    (inputs.llm-agents.overlays.default final prev)
    // {
      pi = final.callPackage ../../pkgs/pi {};
      pi-web-access = final.callPackage ../../pkgs/pi-web-access {};
      llm-wiki = final.callPackage ../../pkgs/llm-wiki {};
      pi-gateway = final.callPackage ../../pkgs/pi-gateway {};
      qmd = mkQmd final final.stdenv.hostPlatform.system;
    };
}
