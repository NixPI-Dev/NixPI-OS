{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
  chromium,
}:
buildNpmPackage {
  pname = "nixpi-gateway";
  version = "0.1.0";

  src = ./.;

  npmDepsHash = "sha256-rEUISTmORNHB1LaRnBxzdWoKtoucTvgFsSmVzkVJVqc=";

  nativeBuildInputs = [makeWrapper];

  makeCacheWritable = true;
  env.PUPPETEER_SKIP_DOWNLOAD = "1";

  buildPhase = ''
    runHook preBuild
    npm run build
    runHook postBuild
  '';

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm run test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/nixpi-gateway $out/bin
    cp -r dist node_modules package.json $out/share/nixpi-gateway/

    makeWrapper ${nodejs}/bin/node $out/bin/nixpi-gateway \
      --add-flags "$out/share/nixpi-gateway/dist/main.js"

    runHook postInstall
  '';

  meta = {
    description = "NixPI generic transport gateway — routes messages from Signal and WhatsApp to Pi";
    license = lib.licenses.mit;
    mainProgram = "nixpi-gateway";
  };
}
