{
  lib,
  buildNpmPackage,
  fetchNpmDeps,
  nodejs,
  makeWrapper,
}: let
  src = ../../pi-bundle/extensions/nixpi/llm-wiki;
in
  buildNpmPackage {
    pname = "llm-wiki";
    version = "0.1.0";

    inherit src;

    npmDeps = fetchNpmDeps {
      inherit src;
      hash = "sha256-+LeWxRQkXOuVRHqg76p3DEdj7T9xEpUpohCY/G1tHGY=";
    };

    nativeBuildInputs = [makeWrapper];

    dontNpmBuild = true;

    installPhase = ''
      runHook preInstall

      mkdir -p $out/share/llm-wiki $out/bin
      cp -r . $out/share/llm-wiki/

      makeWrapper ${nodejs}/bin/node $out/bin/llm-wiki \
        --add-flags "--experimental-strip-types $out/share/llm-wiki/cli.ts"

      runHook postInstall
    '';

    meta = {
      description = "Portable Markdown wiki runtime and Pi extension for capture, search, scaffolding, ingest, and linting";
      license = lib.licenses.mit;
      platforms = lib.platforms.all;
      mainProgram = "llm-wiki";
    };
  }
