/**
 * Subscription gate — `isSubscriptionEffective` adalah SATU-SATUNYA gate
 * date-aware yang boleh dipakai `requireEffectiveSubscription` (docs/02 §2.4,
 * AGENTS.md §Resolusi Konflik). Status DB + tanggal kedaluwarsa harus
 * diperiksa BERSAMA — status string saja tidak cukup.
 *
 * Test ini mengunci invariant tersebut supaya route mutasi konsisten
 * melempar `SUBSCRIPTION_EXPIRED` untuk kondisi expired-by-time.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

import { PAST_DUE_GRACE_DAYS, isSubscriptionEffective } from "../src/lib/subscription-math.ts";

const iso = (d: Date) => d.toISOString();
const daysFromNow = (n: number, ref = new Date()) => new Date(ref.getTime() + n * 86_400_000);

test("cancelled/expired: selalu inefektif (status short-circuit)", () => {
  const now = new Date();
  assert.equal(isSubscriptionEffective("cancelled", null, iso(daysFromNow(30, now)), now), false);
  assert.equal(isSubscriptionEffective("expired", null, iso(daysFromNow(30, now)), now), false);
});

test("trial: efektif selama trialEndsAt di masa depan", () => {
  const now = new Date();
  assert.equal(isSubscriptionEffective("trial", iso(daysFromNow(3, now)), null, now), true);
});

test("trial: TIDAK efektif setelah trialEndsAt lewat (gate by-time)", () => {
  const now = new Date();
  assert.equal(isSubscriptionEffective("trial", iso(daysFromNow(-1, now)), null, now), false);
});

test("active: efektif selama currentPeriodEnd di masa depan", () => {
  const now = new Date();
  assert.equal(isSubscriptionEffective("active", null, iso(daysFromNow(10, now)), now), true);
});

test("active: TIDAK efektif setelah currentPeriodEnd lewat", () => {
  const now = new Date();
  assert.equal(isSubscriptionEffective("active", null, iso(daysFromNow(-1, now)), now), false);
});

test("past_due: efektif dalam grace window (docs/02 §2.4)", () => {
  const now = new Date();
  // Baru saja jatuh tempo (lewat 1 hari) → masih dalam PAST_DUE_GRACE_DAYS.
  const end = iso(daysFromNow(-1, now));
  assert.equal(isSubscriptionEffective("past_due", null, end, now), true);
});

test("past_due: TIDAK efektif setelah grace lewat", () => {
  const now = new Date();
  // Sudah lewat grace + buffer 1 hari.
  const end = iso(daysFromNow(-(PAST_DUE_GRACE_DAYS + 1), now));
  assert.equal(isSubscriptionEffective("past_due", null, end, now), false);
});

test("status tak dikenal → inefektif (fail-closed)", () => {
  const now = new Date();
  assert.equal(isSubscriptionEffective("mystery", null, iso(daysFromNow(10, now)), now), false);
});

test("PAST_DUE_GRACE_DAYS positif & integer (invariant docs/02)", () => {
  assert.ok(Number.isInteger(PAST_DUE_GRACE_DAYS));
  assert.ok(PAST_DUE_GRACE_DAYS > 0);
});

// ---------------------------------------------------------------------------
// C3 (security) — mutasi finansial WAJIB lewat gate lifecycle tunggal.
// Static check (action memanggil supabase; tak bisa dijalankan di node).
// ---------------------------------------------------------------------------

async function readServer(rel: string): Promise<string> {
  return readFile(new URL(`../${rel}`, import.meta.url), "utf8");
}

test("C3: confirmCashPaymentAction memanggil requireEffectiveSubscription(write)", async () => {
  const src = await readServer("src/server/cash-payment-actions.ts");
  assert.match(
    src,
    /requireEffectiveSubscription\s*\(\s*ctx\.businessId\s*,\s*["']write["']\s*\)/,
    "cash confirm HARUS ter-gate subscription (write)"
  );
  assert.match(
    src,
    /confirmCashPaymentByOperator/,
    "settlement tunai tetap dipanggil setelah gate"
  );
  // Error gate dikembalikan dengan kode terketik (mis. SUBSCRIPTION_EXPIRED).
  assert.match(src, /code/, "error gate harus membawa kode (SUBSCRIPTION_EXPIRED dll)");
});

test("C3: semua action finansial inti ter-gate requireEffectiveSubscription", async () => {
  const files = [
    "src/server/cash-payment-actions.ts",
    "src/server/finance-actions.ts",
    "src/server/pos-actions.ts",
    "src/server/booth-actions.ts",
  ];
  for (const f of files) {
    const src = await readServer(f);
    assert.match(src, /requireEffectiveSubscription/, `${f} kehilangan gate subscription`);
  }
});
