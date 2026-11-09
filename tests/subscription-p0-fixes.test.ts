/**
 * P0/P2 fixes di file server-only (tak bisa dijalankan dengan fake DB) —
 * verifikasi statis sumber agar regresi terdeteksi. Gaya mengikuti
 * tests/plan-limits-fail-closed.test.ts (readFile + regex).
 *
 * Cakupan:
 *  - subscription.ts: downgrade guard (tanpa owner, +packages/templates),
 *    renewal plan-sama (new_period), qty add-on feature, urutan promo,
 *    retry seq invoice, overview cancelled + seat extra_session.
 *  - payment/invoice.ts: late payment invoice void.
 *  - storage-usage.ts: kuota add-on fail-closed saat subscription tidak efektif.
 *
 * Jalankan: npm test
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
async function read(rel: string): Promise<string> {
  return readFile(new URL(rel, root), "utf8");
}

function createSubscriptionInvoiceBody(src: string): string {
  const start = src.indexOf("export async function createSubscriptionInvoice");
  assert.ok(start > -1, "createSubscriptionInvoice ditemukan");
  return src.slice(start);
}

test("P0 #3 downgrade guard: staff tanpa owner + cek package/template", async () => {
  const src = await read("src/server/subscription.ts");
  assert.match(src, /\.neq\("role",\s*"owner"\)/, "staff count harus mengecualikan owner");
  assert.match(src, /max_packages,\s*max_templates/, "plan select memuat max_packages/max_templates");
  assert.match(src, /usage\.packages > planRow\.max_packages/);
  assert.match(src, /usage\.templates > planRow\.max_templates/);
  assert.match(src, /PLAN_LIMIT_REACHED/);
});

test("P0 #7 renewal plan-sama: isRenewal + plan_change new_period", async () => {
  const src = await read("src/server/subscription.ts");
  assert.match(src, /const isRenewal = currentRow\.status === "past_due" \|\| currentRow\.status === "expired"/);
  assert.match(src, /isRenewal \? \{ new_period: true \} : \{\}/);
  assert.match(src, /isRenewal \|\|/);
});

test("P0 #11 add-on feature qty > 1 ditolak VALIDATION_ERROR", async () => {
  const src = await read("src/server/subscription.ts");
  assert.match(src, /addOnQuantityAllowed\(raw\.unit,\s*qty\)/);
  assert.match(src, /tidak dapat dibeli lebih dari 1/);
  assert.match(src, /"VALIDATION_ERROR"/);
});

test("P0 #8/#9 overview: cancelled ditampilkan + seat hanya extra_session", async () => {
  const src = await read("src/server/subscription.ts");
  const overview = src.slice(
    src.indexOf("export async function getSubscriptionOverview"),
    src.indexOf("export async function createSubscriptionInvoice")
  );
  assert.match(
    overview,
    /\["trial",\s*"active",\s*"past_due",\s*"expired",\s*"cancelled"\]/,
    "overview harus menyertakan cancelled"
  );
  assert.match(overview, /sessionAddOnQuantities\(activeAddOns\)/);
  // createSubscriptionInvoice eligibility TIDAK ikut memasukkan cancelled.
  const create = createSubscriptionInvoiceBody(src);
  const createSelect = create.slice(0, create.indexOf("add_ons"));
  assert.doesNotMatch(
    createSelect,
    /"cancelled"/,
    "checkout eligibility tidak boleh menyertakan cancelled"
  );
});

test("P2 #12 promo: consume sebelum insert; void pakai update().select; release saat insert gagal", async () => {
  const body = createSubscriptionInvoiceBody(await read("src/server/subscription.ts"));
  const consumeAt = body.indexOf("consumeSubscriptionPromo(");
  const insertAt = body.indexOf("await insertInvoice(");
  assert.ok(consumeAt > -1 && insertAt > -1, "consume + insertInvoice ditemukan");
  assert.ok(consumeAt < insertAt, "consume promo harus SEBELUM insert invoice");
  assert.match(
    body.slice(insertAt),
    /catch \(error\)[\s\S]*releaseSubscriptionPromo\(promo\.code\)[\s\S]*throw error/,
    "insert gagal harus melepas promo lalu rethrow"
  );
  assert.match(
    body,
    // `id` wajib ikut di-select: RPC release_subscription_promo_for_invoice
    // menandai invoice per-id, jadi select("intent") saja tidak cukup.
    /\.update\(\{ status: "void" \}\)[\s\S]*?\.eq\("status", "pending"\)\s*\.select\("(?:id, )?intent"\)/,
    "void promo pakai update().select('id, intent') satu roundtrip"
  );
});

test("P2 #13 insertInvoice retry menaikkan kandidat seq", async () => {
  const src = await read("src/server/subscription.ts");
  assert.match(src, /invoiceNumber\(\(count \?\? 0\) \+ attempt \+ 1, now\)/);
});

test("P0 #1 invoice void: late payment dicatat, tidak auto-reactivate", async () => {
  const src = await read("src/server/payment/invoice.ts");
  assert.match(src, /recordLatePaymentVoidInvoice\(/);
  assert.match(src, /current\?\.status === "void"/);
});

test("P0 #10 storage: add-on MB fail-closed saat subscription tidak efektif (single + batch)", async () => {
  const src = await read("src/server/storage-usage.ts");
  const occurrences = src.match(/const subscriptionEffective = Boolean\(/g) ?? [];
  assert.ok(occurrences.length >= 2, "getStorageLimit + getStorageUsageBatch wajib gate efektif");
  // add-on hanya dihitung saat effective (kedua jalur).
  assert.match(src, /if \(subscriptionEffective && row\?\.id\)/);
  assert.match(src, /const addOnMb = subscriptionEffective && sub \?/);
});

test("P0 #2/#14 failure queue: tanpa upsert partial-index; pakai select→insert/update", async () => {
  const src = await read("src/lib/subscription-intent-apply.ts");
  assert.doesNotMatch(
    src,
    /subscription_intent_failures"\)\.upsert\(/,
    "upsert onConflict invoice_id,reason tidak bisa infer partial unique index"
  );
  assert.match(src, /async function upsertPendingFailure/);
  assert.match(src, /error\.code === "23505"/, "retry update sekali pada unique violation 23505");
});
