import assert from "node:assert/strict";
import test from "node:test";
import type { InboundMessage } from "../src/core/types.js";
import { PersonalRouter } from "../src/core/personal-router.js";

function whatsappMessage(text: string): InboundMessage {
  return {
    channel: "whatsapp",
    chatId: "whatsapp:+40721123456",
    senderId: "whatsapp:+40721123456",
    messageId: `test:${text}`,
    timestamp: new Date(0).toISOString(),
    text,
    isGroup: false,
    access: {
      allowedSenderIds: ["whatsapp:+40721123456"],
      adminSenderIds: ["whatsapp:+40721123456"],
      directMessagesOnly: true,
      selfSenderIds: [],
    },
  };
}

test("PersonalRouter refuses technical operator work on WhatsApp", async () => {
  const router = new PersonalRouter();
  const route = await router.route(whatsappMessage("rebuild the nixos server"), "rebuild the nixos server");

  assert.equal(route.kind, "reply");
  if (route.kind === "reply") {
    assert.match(route.text, /personal mode/i);
    assert.match(route.text, /Pi Console\/TUI/i);
  }
});

test("PersonalRouter sends ordinary WhatsApp chat to Pi with personal system prompt", async () => {
  const router = new PersonalRouter();
  const route = await router.route(whatsappMessage("help me plan tomorrow"), "help me plan tomorrow");

  assert.equal(route.kind, "prompt");
  if (route.kind === "prompt") {
    assert.equal(route.message, "help me plan tomorrow");
    assert.match(route.systemPromptAddendum, /personal companion mode/i);
  }
});
