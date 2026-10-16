import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { processDirectWebhook, type DirectWebhookDependencies, type DirectWebhookInput } from "../src/lib/direct-webhook.ts";
import { redactWebhookPayload } from "../src/lib/error-redaction.ts";
import { computeMidtransSignature, createMidtransGateway } from "../src/server/payment/providers/midtrans.ts";
import { computeTripaySignature, createTripayGateway } from "../src/server/payment/providers/tripay.ts";
import { createPakasirGateway } from "../src/server/payment/providers/pakasir.ts";
import type { PaymentGateway } from "../src/server/payment/providers/types.ts";

type State = { credentialId: string | null; gateway: PaymentGateway | null; payment: boolean; events: Map<string, string>; transitions: number; effects: number; credits: number; fees: number; transactions: number; audits: number; logs: unknown[]; verifyPaid: boolean };
function setup(gateway: PaymentGateway | null, credentialId: string | null = "cred-1") {
  const state: State = { credentialId, gateway, payment: true, events: new Map(), transitions: 0, effects: 0, credits: 0, fees: 0, transactions: 0, audits: 0, logs: [], verifyPaid: true };
  const deps: DirectWebhookDependencies = {
    async findPayment() { return state.payment ? { id: "pay", business_id: "biz", checkout_session_id: "checkout", credential_id: state.credentialId, final_amount: 50000, total_amount: null, order_id: "SnapyOS-MID", provider_ref: null } : null; },
    async resolveGateway() { return state.gateway; },
    async persist(log) { state.logs.push(redactWebhookPayload(log.payload)); if (state.events.has(log.eventId)) return "duplicate"; state.events.set(log.eventId, log.status); return "logged"; },
    // H3 — klaim state-aware: processed/ignored = duplicate; received/error = retryable.
    async claimEvent(log) {
      state.logs.push(redactWebhookPayload(log.payload));
      const existing = state.events.get(log.eventId);
      if (existing === "processed" || existing === "ignored") return "duplicate";
      if (existing === "received" || existing === "error") return "retryable";
      state.events.set(log.eventId, "received");
      return "claimed";
    },
    async promoteEvent(eventId, status) { state.events.set(eventId, status); },
    async transitionToPaid() { state.transitions++; return true; },
    async transitionToExpired() { return true; },
    async loadCheckout() { return {}; },
    async runPaidSideEffects() { state.effects++; state.transactions++; state.fees++; state.audits++; },
    async verifyPaidWithProvider() { return state.verifyPaid; },
  };
  return { state, deps };
}
const mid = () => createMidtransGateway({ id: "cred-1", provider: "midtrans", merchantId: "m", serverKey: "server-secret", clientKey: null, environment: "sandbox", metadata: {} });
const tri = () => createTripayGateway({ id: "cred-1", provider: "tripay", merchantId: "m", serverKey: "api-secret", clientKey: null, environment: "sandbox", metadata: { private_key: "private-secret" } });
function midInput(signature: string, amount = 50000): DirectWebhookInput {
  const payload = { order_id: "SnapyOS-MID", status_code: "200", gross_amount: `${amount}.00`, signature_key: signature, transaction_status: "settlement", fraud_status: "accept" };
  return { provider: "midtrans", orderId: payload.order_id, eventId: "mid:event", eventType: "settlement", amount, payload, signaturePayload: payload, signature, paid: true, expired: false, invalidEventId: "mid:invalid" };
}
function triInput(raw: string, signature: string): DirectWebhookInput {
  return { provider: "tripay", orderId: "SnapyOS-TRI", eventId: "tri:event", eventType: "PAID", amount: 50000, payload: JSON.parse(raw), signaturePayload: raw, signature, paid: true, expired: false, invalidEventId: "tri:invalid" };
}

test("Midtrans valid signature settles exactly once; direct skips credit and records receivable", async () => {
  const signature = computeMidtransSignature("SnapyOS-MID", "200", "50000.00", "server-secret");
  const { state, deps } = setup(mid());
  assert.equal((await processDirectWebhook(midInput(signature), deps)).reason, "paid");
  assert.equal((await processDirectWebhook(midInput(signature), deps)).reason, "duplicate_event");
  assert.deepEqual([state.transitions, state.effects, state.transactions, state.fees, state.credits, state.audits], [1, 1, 1, 1, 0, 1]);
});

test("Midtrans rejects bad signature, fraud, unknown, credential mismatch, aggregate payment, amount mismatch", async () => {
  const signature = computeMidtransSignature("SnapyOS-MID", "200", "50000.00", "server-secret");
  assert.equal((await processDirectWebhook(midInput("0".repeat(128)), setup(mid()).deps)).reason, "invalid_signature");
  assert.equal((await processDirectWebhook({ ...midInput(signature), paid: false, rejectReason: "fraud_status tidak diterima" }, setup(mid()).deps)).reason, "rejected");
  const unknown = setup(mid()); unknown.state.payment = false;
  assert.equal((await processDirectWebhook(midInput(signature), unknown.deps)).reason, "unknown_order");
  assert.equal((await processDirectWebhook(midInput(signature), setup(tri()).deps)).reason, "credential_mismatch");
  assert.equal((await processDirectWebhook(midInput(signature), setup(mid(), null).deps)).reason, "missing_credential");
  const wrongAmountSignature = computeMidtransSignature("SnapyOS-MID", "200", "49999.00", "server-secret");
  assert.equal((await processDirectWebhook(midInput(wrongAmountSignature, 49999), setup(mid()).deps)).reason, "amount_mismatch");
});

test("server-to-server re-verify gates settlement (provider says not paid → no settle)", async () => {
  const signature = computeMidtransSignature("SnapyOS-MID", "200", "50000.00", "server-secret");
  const s = setup(mid()); s.state.verifyPaid = false;
  assert.equal((await processDirectWebhook(midInput(signature), s.deps)).reason, "provider_not_paid");
  assert.deepEqual([s.state.transitions, s.state.effects], [0, 0], "tidak settle bila provider tidak konfirmasi paid");
});

test("Tripay verifies original raw body HMAC and rejects alteration", async () => {
  const raw = '{"merchant_ref":"SnapyOS-TRI","status":"PAID","amount":50000}';
  const signature = computeTripaySignature(raw, "private-secret");
  const live = setup(tri());
  assert.equal((await processDirectWebhook(triInput(raw, signature), live.deps)).reason, "paid");
  assert.equal((await processDirectWebhook(triInput(raw, signature), live.deps)).reason, "duplicate_event");
  assert.equal((await processDirectWebhook(triInput(`${raw} `, signature), setup(tri()).deps)).reason, "invalid_signature");
});

test("idempotency persistence failure blocks direct settlement", async () => {
  const signature = computeMidtransSignature("SnapyOS-MID", "200", "50000.00", "server-secret");
  const { state, deps } = setup(mid());
  deps.claimEvent = async () => { throw new Error("database unavailable"); };
  await assert.rejects(() => processDirectWebhook(midInput(signature), deps), /database unavailable/);
  assert.deepEqual([state.transitions, state.effects, state.transactions, state.fees, state.credits, state.audits], [0, 0, 0, 0, 0, 0]);
});

// ---------------------------------------------------------------------------
// H3 — idempotency dipersist sebelum verify, tapi state-aware: verify-gagal
// boleh di-redeliver & settle; processed tidak double-settle.
// ---------------------------------------------------------------------------

test("H3: verify gagal → redelivery tetap bisa settle (tidak diblokir duplicate)", async () => {
  const signature = computeMidtransSignature("SnapyOS-MID", "200", "50000.00", "server-secret");
  const { state, deps } = setup(mid());
  // 1) provider bilang belum paid.
  state.verifyPaid = false;
  assert.equal((await processDirectWebhook(midInput(signature), deps)).reason, "provider_not_paid");
  assert.equal(state.transitions, 0, "tidak settle saat verify gagal");
  assert.equal(state.events.get("mid:event"), "error", "baris event = error (retryable)");
  // 2) redelivery setelah provider paid → HARUS settle (bukan duplicate_event).
  state.verifyPaid = true;
  assert.equal((await processDirectWebhook(midInput(signature), deps)).reason, "paid");
  assert.equal(state.transitions, 1);
  assert.equal(state.events.get("mid:event"), "processed");
});

test("H3: event sudah processed → redelivery tidak double-settle", async () => {
  const signature = computeMidtransSignature("SnapyOS-MID", "200", "50000.00", "server-secret");
  const { state, deps } = setup(mid());
  assert.equal((await processDirectWebhook(midInput(signature), deps)).reason, "paid");
  assert.equal((await processDirectWebhook(midInput(signature), deps)).reason, "duplicate_event");
  assert.equal(state.transitions, 1, "settle tepat sekali");
});

test("retired legacy gateway route remains absent", () => {
  const retiredRoute = ["klik", "qris"].join("-");
  assert.equal(existsSync(resolve(`src/app/api/webhooks/payment/${retiredRoute}/route.ts`)), false);
});

test("secrets redact from webhook logs; Pakasir aggregator remains separate", () => {
  const logged = JSON.stringify(redactWebhookPayload({ server_key: "server-secret", nested: { private_key: "private-secret" } }));
  assert.equal(logged.includes("server-secret") || logged.includes("private-secret"), false);
  assert.equal(createPakasirGateway(null).provider, "pakasir");
});
