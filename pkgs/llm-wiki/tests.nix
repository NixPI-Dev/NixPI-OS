{
  buildNpmPackage,
  fetchNpmDeps,
}: let
  src = ./.;
  extensionSrc = ../../pi-bundle/extensions/nixpi/llm-wiki;
in
  buildNpmPackage {
    pname = "llm-wiki-tests";
    version = "0.1.0";

    inherit src;

    npmDeps = fetchNpmDeps {
      inherit src;
      hash = "sha256-Hb6tMA4BBIMKIDwGoZmNb6fcjDkUNYhQsLsfOKEbGuc=";
    };

    postPatch = ''
      cp -R ${extensionSrc} extension
    '';

    dontNpmBuild = true;
    doCheck = true;

    checkPhase = ''
      runHook preCheck
      npm run test:ci
      runHook postCheck
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out
      touch $out/passed
      runHook postInstall
    '';
  }
