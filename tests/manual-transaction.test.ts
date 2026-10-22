/**
 * Manual transaction invariants (docs/03, migrasi 0033).
 *
 * `createManualTransaction` HARUS:
 *   - hanya menerima `payment_method: "manual"` (schema literal).
 *   - insert baris `transactions` dengan `withdrawable=false`.
 *   - TIDAK menyentuh `payments` (tidak ada settlement).
 *   - TIDAK menyentuh `balance_ledger` (saldo penarikan tidak naik).
 *
 * Menghindari harness Supabase penuh — kita kunci invariant lewat:
 *   (a) validator schema (compile-time literal + runtime reject),
 *   (b) grep source `src/server/transactions.ts` untuk konstanta
 *       `withdrawable: false` + absence of `payments`/`balance_ledger`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { manualTransactionSchema } from "../src/lib/validators.ts";

// UUIDv4 valid — validator memakai regex ketat v1-8 (Zod v4).
const uuid = "11111111-1111-4111-8111-111111111111";

test("schema: hanya menerima literal payment_method='manual'", () => {
  const parsed = manualTransactionSchema.parse({
    outlet_id: uuid,
    photobox_id: uuid,
    payment_method: "manual",
    gross_amount: 25000,
  });
  assert.equal(parsed.payment_method, "manual");
  assert.equal(parsed.discount_amount, 0);
});

test("schema: menolak payment_method selain 'manual' (cash/qris/dll)", () => {
  const invalid = ["cash", "qris", "bank_transfer", "offline", "other"];
  for (const method of invalid) {
    assert.throws(
      () =>
        manualTransactionSchema.parse({
          outlet_id: uuid,
          photobox_id: uuid,
          payment_method: method,
          gross_amount: 10_000,
        }),
      `payment_method="${method}" harus ditolak`
    );
  }
});

test("schema: menolak gross_amount <= 0 (tidak boleh 0/negatif)", () => {
  for (const gross of [0, -1, -1000]) {
    assert.throws(() =>
      manualTransactionSchema.parse({
        outlet_id: uuid,
        photobox_id: uuid,
        payment_method: "manual",
        gross_amount: gross,
      })
    );
  }
});

test("schema: menolak gross non-integer (uang selalu integer IDR)", () => {
  assert.throws(() =>
    manualTransactionSchema.parse({
      outlet_id: uuid,
      photobox_id: uuid,
      payment_method: "manual",
      gross_amount: 10_000.5,
    })
  );
});

test("source: createManualTransaction insert dengan withdrawable=false", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "src", "server", "transactions.ts"), "utf8");
  // Pastikan literal `withdrawable: false` benar-benar ada dalam block insert.
  const insertStart = src.indexOf("createManualTransaction");
  assert.ok(insertStart > 0, "fungsi createManualTransaction tidak ditemukan");
  const insertBlock = src.slice(insertStart);
  assert.ok(
    /withdrawable\s*:\s*false/.test(insertBlock),
    "createManualTransaction wajib insert `withdrawable: false`"
  );
  assert.ok(
    /payment_method\s*:\s*['\"]manual['\"]/.test(insertBlock),
    "createManualTransaction wajib insert `payment_method: 'manual'`"
  );
});

test("source: createManualTransaction TIDAK menyentuh payments/balance_ledger", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "src", "server", "transactions.ts"), "utf8");
  const fnStart = src.indexOf("export async function createManualTransaction");
  assert.ok(fnStart > 0, "fungsi createManualTransaction tidak ditemukan");
  // Slice sampai akhir fungsi (heuristik: fungsi berikutnya atau EOF).
  const nextFn = src.indexOf("\nexport ", fnStart + 1);
  const block = src.slice(fnStart, nextFn === -1 ? undefined : nextFn);
  assert.ok(
    !/\.from\(['\"]payments['\"]\)/.test(block),
    "createManualTransaction TIDAK boleh memanggil supabase.from('payments')"
  );
  assert.ok(
    !/\.from\(['\"]balance_ledger['\"]\)/.test(block),
    "createManualTransaction TIDAK boleh menyentuh balance_ledger"
  );
  assert.ok(
    !/\.rpc\(['\"]credit_balance/.test(block),
    "createManualTransaction TIDAK boleh memanggil creditBalance RPC"
  );
});

test("source: createManualTransaction menolak booth yang bukan milik outlet", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "src", "server", "transactions.ts"), "utf8");
  const fnStart = src.indexOf("export async function createManualTransaction");
  assert.ok(fnStart > 0, "fungsi createManualTransaction tidak ditemukan");
  const nextFn = src.indexOf("\nexport ", fnStart + 1);
  const block = src.slice(fnStart, nextFn === -1 ? undefined : nextFn);
  assert.match(
    block,
    /assertBoothInOutlet\(\s*businessId\s*,\s*parsed\.outlet_id\s*,\s*parsed\.photobox_id\s*\)/,
    "createManualTransaction wajib memanggil assertBoothInOutlet(outlet_id, photobox_id)"
  );

  // Helper harus membandingkan outlet_id hasil query dengan outlet yang diminta.
  const helperStart = src.indexOf("async function assertBoothInOutlet");
  assert.ok(helperStart > 0, "helper assertBoothInOutlet tidak ditemukan");
  const helper = src.slice(helperStart, fnStart);
  assert.match(helper, /\.select\("id, outlet_id"\)/, "helper wajib membaca outlet_id booth");
  assert.match(helper, /\.eq\("business_id", businessId\)/, "helper wajib scope tenant");
  assert.match(
    helper,
    /outlet_id\s*!==\s*outletId/,
    "helper wajib membandingkan outlet_id booth dengan outlet transaksi"
  );
});
