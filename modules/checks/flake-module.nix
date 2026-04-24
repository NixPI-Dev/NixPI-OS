{...}: {
  perSystem = {
    pkgs,
    system,
    ...
  }: {
    checks = {
      formatting =
        pkgs.runCommand "formatting-check" {
          nativeBuildInputs = [pkgs.alejandra];
        } ''
          cd ${../..}

          find . -type f -name '*.nix' -print0 \
            | xargs -0 alejandra --check

          touch $out
        '';

      nixpi-wiki-tests = pkgs.callPackage ../../pkgs/nixpi-wiki/tests.nix {};
    };
  };
}
