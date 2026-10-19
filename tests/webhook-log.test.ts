/**
 * Idempotensi webhook payment — docs/08 §8.15, docs/11.
 *
 * `src/server/payment/webhook-log.ts` adalah satu-satunya penjaga agar provider
 * yang mengirim ulang event yang sama tidak men-settle dua kali. Sebelum tes ini,
 * jalur tersebut hanya di-mock di tes lain — jadi logika `23505` → duplicate vs
 * retryable, dan fail-closed saat error non-unik, tidak pernah dieksekusi nyata.
 *
 * Yang dikunci:
 *  - insert bentrok unik (23505) pada `claimWebhookEvent` → baca status lama,
 *    `processed`/`ignored` = duplicate (jangan settle ulang), sisanya retryable.
 *  - error DB selain 23505 → THROW (bukan diam-diam dianggap sukses).
 *  - `logPaymentWebhook` best-effort: error apa pun tidak melempar (audit log).
 *  - `promoteWebhookEvent` error → THROW (status terminal wajib tersimpan).
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

import { mockSupabase, stepArgs } from "./helpers/supabase-mock.mjs";

register("./tests/helpers/resolve-loader.mjs", pathToFileURL("./"));

type Log = typeof import("../src/server/payment/webhook-log.ts");
let log: Log;

before(async () => {
  log = await import("../src/server/payment/webhook-log.ts");
});

/** Pasang klien palsu; `insertError` dipakai untuk menjawab insert. */
function setup(opts: { insertError?: unknown; existingStatus?: string | null } = {}) {
  globalThis.__SB_STUB = () =>
    mockSupabase({
      payment_webhooks: ({ steps }) => {
        const isInsert = steps.some((s) => s.method === "insert");
        if (isInsert) {
          return { data: null, error: opts.insertError ?? null };
        }
        return {
          data: opts.existingStatus === undefined ? null : { status: opts.existingStatus },
          error: null,
        };
      },
    });
}

const base = {
  eventId: "evt-1",
  eventType: "payment.success",
  payload: { order_id: "ord-1" },
  signatureValid: true,
  paymentId: null,
};

// --- claimWebhookEvent -------------------------------------------------------

test("claim: insert sukses → claimed", async () => {
  setup();
  assert.equal(await log.claimWebhookEvent(base), "claimed");
});

test("claim: 23505 + status processed → duplicate (jangan settle ulang)", async () => {
  setup({ insertError: { code: "23505", message: "duplicate key" }, existingStatus: "processed" });
  assert.equal(await log.claimWebhookEvent(base), "duplicate");
});

test("claim: 23505 + status ignored → duplicate", async () => {
  setup({ insertError: { code: "23505", message: "duplicate key" }, existingStatus: "ignored" });
  assert.equal(await log.claimWebhookEvent(base), "duplicate");
});

test("claim: 23505 + status received → retryable (redelivery boleh diproses)", async () => {
  setup({ insertError: { code: "23505", message: "duplicate key" }, existingStatus: "received" });
  assert.equal(await log.claimWebhookEvent(base), "retryable");
});

test("claim: 23505 + status error → retryable", async () => {
  setup({ insertError: { code: "23505", message: "duplicate key" }, existingStatus: "error" });
  assert.equal(await log.claimWebhookEvent(base), "retryable");
});

test("claim: 23505 tapi baris hilang (balapan delete) → retryable, bukan crash", async () => {
  setup({ insertError: { code: "23505", message: "duplicate key" }, existingStatus: null });
  assert.equal(await log.claimWebhookEvent(base), "retryable");
});

test("claim: error DB non-unik → THROW (fail-closed, tidak dianggap sukses)", async () => {
  setup({ insertError: { code: "42P01", message: 'relation "payment_webhooks" does not exist' } });
  await assert.rejects(() => log.claimWebhookEvent(base), /Gagal menyimpan webhook payment/);
});

test("claim: baca status memakai event_id (bukan kolom lain)", async () => {
  let eqs: unknown[][] = [];
  globalThis.__SB_STUB = () =>
    mockSupabase({
      payment_webhooks: ({ steps }) => {
        eqs = stepArgs(steps, "eq");
        if (steps.some((s) => s.method === "insert")) {
          return { data: null, error: { code: "23505", message: "dup" } };
        }
        return { data: { status: "processed" }, error: null };
      },
    });
  assert.equal(await log.claimWebhookEvent({ ...base, eventId: "evt-xyz" }), "duplicate");
  assert.deepEqual(eqs, [["event_id", "evt-xyz"]]);
});

// --- logPaymentWebhook (best-effort audit) -----------------------------------

test("log: insert sukses → logged", async () => {
  setup();
  assert.equal(await log.logPaymentWebhook({ ...base, status: "received" }), "logged");
});

test("log: 23505 → duplicate", async () => {
  setup({ insertError: { code: "23505", message: "duplicate key" } });
  assert.equal(await log.logPaymentWebhook({ ...base, status: "processed" }), "duplicate");
});

test("log: error lain → tetap logged, TIDAK melempar (audit best-effort)", async () => {
  setup({ insertError: { code: "42P01", message: "relation does not exist" } });
  assert.equal(await log.logPaymentWebhook({ ...base, status: "error" }), "logged");
});

// --- promoteWebhookEvent -----------------------------------------------------

test("promote: sukses → tidak melempar", async () => {
  setup();
  await log.promoteWebhookEvent({ eventId: "evt-1", status: "processed", paymentId: "pay-1" });
});

test("promote: error DB → THROW (status terminal wajib tersimpan)", async () => {
  globalThis.__SB_STUB = () =>
    mockSupabase({
      payment_webhooks: () => ({ data: null, error: { code: "42P01", message: "boom" } }),
    });
  await assert.rejects(
    () => log.promoteWebhookEvent({ eventId: "evt-1", status: "processed", paymentId: null }),
    /Gagal memperbarui webhook payment/
  );
});
