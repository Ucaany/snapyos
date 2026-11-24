import test from "node:test";
import assert from "node:assert/strict";
import { buildTelegramUrl, formatSnapyEvent, sendTelegramMessage } from "./snapyos-telegram.mjs";

test("formats subscription events in Indonesian without exposing ids", () => {
  const message = formatSnapyEvent({ type: "subscription.paid", businessName: "KLIK FOTO", planName: "Growth", amount: 249000, status: "active" });
  assert.match(message, /Pembayaran subscription diterima/);
  assert.match(message, /KLIK FOTO/);
  assert.match(message, /Rp249\.000/);
  assert.doesNotMatch(message, /business_id|invoice_id/);
});

test("formats new owner and lifecycle events", () => {
  assert.match(formatSnapyEvent({ type: "business.created", businessName: "Studio Rio", ownerName: "Rio" }), /Workspace baru/);
  assert.match(formatSnapyEvent({ type: "subscription.expired", businessName: "Studio Rio", status: "expired" }), /expired/);
});

test("targets configured Telegram topic in sendMessage URL", () => {
  assert.equal(buildTelegramUrl("123:secret", "-100123", "17069"), "https://api.telegram.org/bot123:secret/sendMessage");
});

test("requires topic id rather than silently sending to chat root", () => {
  assert.throws(() => buildTelegramUrl("token", "-100123", ""), /topic/i);
});

test("sends the topic thread id in Telegram request body", async () => {
  let sent;
  await sendTelegramMessage({ token: "token", chatId: "-100123", topicId: "17069", text: "test", fetchImpl: async (_url, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ ok: true, result: { message_id: 7 } }) }; } });
  assert.equal(sent.message_thread_id, 17069);
  assert.equal(sent.chat_id, "-100123");
});
