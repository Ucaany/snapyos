/**
 * Paritas `db/schema.sql` ↔ migrasi 0063/0077/0078/0079/0080.
 *
 * Baseline schema dipakai untuk membuat database baru; migrasi dipakai untuk
 * database yang sudah berjalan. Bila keduanya berbeda, `psql -f db/schema.sql`
 * menghasilkan skema yang tidak bisa dipakai kode (mis. `plan-limits.ts`
 * membaca `plans.max_packages` → 42703).
 *
 * Tes ini tidak menjalankan Postgres (mesin ini tidak punya `psql`); yang
 * dijaga adalah keberadaan literal DDL yang sama di kedua berkas.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function read(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

let schema: string;

test("muat schema.sql", async () => {
  schema = await read("db/schema.sql");
  assert.ok(schema.includes("create table plans"), "schema.sql tidak memuat tabel plans");
});

test("0077: plans.max_packages & plans.max_templates ada di schema.sql", () => {
  assert.match(schema, /max_packages integer not null default 50/);
  assert.match(schema, /max_templates integer not null default 20/);
});

test("0078: tiga index hot path webhook/payment ada di schema.sql", () => {
  for (const index of [
    "idx_payment_webhooks_status_received",
    "idx_payment_webhooks_provider_status",
    "idx_payments_status_created",
  ]) {
    assert.ok(schema.includes(index), `${index} hilang dari schema.sql`);
  }
});

test("0079: FK customer_id ke customers memakai ON DELETE RESTRICT", () => {
  // pos_orders + voucher_usages inline, sessions + transactions lewat alter.
  const restrict = schema.match(/references customers \(id\) on delete restrict/g) ?? [];
  assert.equal(restrict.length, 4, `expected 4 FK restrict, got ${restrict.length}`);
  assert.ok(
    !/references customers \(id\) on delete set null/.test(schema),
    "masih ada FK customers ON DELETE SET NULL"
  );
});

test("0080: transactions.payment_id tidak lagi ber-FK (siklus dengan payments)", () => {
  assert.match(schema, /alter table transactions add column payment_id uuid;/);
  assert.ok(
    !/transactions add column payment_id uuid references/.test(schema),
    "FK siklus transactions.payment_id masih ada"
  );
  // payments.transaction_id tetap ber-FK: arah itu yang dipakai ON DELETE SET NULL.
  assert.match(schema, /payments\.transaction_id|transaction_id uuid references transactions/);
});

test("0063: invoice_payments.credential_id punya FK ke payment_credentials", () => {
  assert.ok(
    schema.includes("invoice_payments_credential_id_fkey"),
    "FK invoice_payments.credential_id hilang dari schema.sql"
  );
});

test("setiap DDL di atas juga benar-benar ada di berkas migrasinya", async () => {
  const [m77, m78, m79, m80, m63] = await Promise.all([
    read("db/migrations/0077_plan_limits_packages_templates.sql"),
    read("db/migrations/0078_webhook_hot_path_indexes.sql"),
    read("db/migrations/0079_customer_fk_restrict.sql"),
    read("db/migrations/0080_fix_circular_fk_transactions_payments.sql"),
    read("db/migrations/0063_payment_method_voucher_and_index_drift.sql"),
  ]);
  assert.match(m77, /max_packages/);
  assert.match(m78, /idx_payment_webhooks_status_received/);
  assert.match(m79, /on delete restrict/);
  assert.match(m80, /drop constraint if exists transactions_payment_id_fkey/);
  assert.match(m63, /invoice_payments_credential_id_fkey/);
});
