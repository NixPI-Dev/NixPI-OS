{
  lib,
  buildNpmPackage,
  fetchurl,
  fetchNpmDeps,
  runCommand,
}: let
  versionData = lib.importJSON ./hashes.json;
  version = versionData.version;

  srcWithLock = runCommand "pi-web-access-src-with-lock" {} ''
    mkdir -p $out
    tar -xzf ${
      fetchurl {
        url = "https://registry.npmjs.org/pi-web-access/-/pi-web-access-${version}.tgz";
        hash = versionData.sourceHash;
      }
    } -C $out --strip-components=1
    cp ${./package-lock.json} $out/package-lock.json
  '';
in
  buildNpmPackage {
    pname = "pi-web-access";
    inherit version;

    src = srcWithLock;

    npmDeps = fetchNpmDeps {
      src = srcWithLock;
      hash = versionData.npmDepsHash;
    };

    dontNpmBuild = true;

    installPhase = ''
      runHook preInstall

      mkdir -p $out/share/pi-web-access
      cp -r . $out/share/pi-web-access/

      runHook postInstall
    '';

    meta = {
      description = "Web search, content extraction, and video understanding extension for Pi";
      homepage = "https://github.com/nicobailon/pi-web-access";
      license = lib.licenses.mit;
      platforms = lib.platforms.all;
    };
  }
