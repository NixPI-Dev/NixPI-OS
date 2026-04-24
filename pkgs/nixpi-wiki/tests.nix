{
  buildNpmPackage,
  fetchNpmDeps,
}: let
  src = ./.;
  extensionSrc = ../../pi-bundle/extensions/nixpi/nixpi/wiki;
in
  buildNpmPackage {
    pname = "nixpi-wiki-tests";
    version = "0.1.0";

    inherit src;

    npmDeps = fetchNpmDeps {
      inherit src;
      hash = "sha256-DgLvZzSQd6ASr7P5aHq3TQ1SYCFIRZ57fzomnXxZRAw=";
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
