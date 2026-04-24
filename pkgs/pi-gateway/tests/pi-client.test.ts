import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PiClient } from "../src/core/pi-client.js";

test("PiClient passes per-call environment overrides to the Pi process", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pi-gateway-pi-client-"));
  try {
    const fakePi = path.join(tmp, "fake-pi.mjs");
    writeFileSync(
      fakePi,
      `#!${process.execPath}
console.log(process.env.PI_GATEWAY_PROFILE || "");
`,
      "utf-8",
    );
    chmodSync(fakePi, 0o755);

    const client = new PiClient(fakePi, path.join(tmp, "sessions"), tmp, 10_000);
    const reply = await client.prompt("hello", null, {
      env: { PI_GATEWAY_PROFILE: "whatsapp-personal" },
    });

    assert.equal(reply.text, "whatsapp-personal");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
