import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("migration 0073 menyediakan snapshot struk dan RPC POS atomic", async () => {
  const migration = await readFile(
    new URL("db/migrations/0073_pos_receipt_snapshot_and_untracked_stock.sql", root),
    "utf8"
  );

  for (const column of ["paper_width_mm", "print_mode", "auto_print"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(migration, /create or replace function pos_create_order_with_items/i);
  assert.match(migration, /create or replace function pos_set_booth_enabled/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /revoke execute on function pos_create_order_with_items/i);
  assert.match(
    migration,
    /grant execute on function pos_create_order_with_items[^\n]+service_role/i
  );
  assert.match(migration, /revoke execute on function pos_set_booth_enabled/i);
  assert.match(migration, /grant execute on function pos_set_booth_enabled[^\n]+service_role/i);
  assert.match(migration, /if v_stock is null then\s+return true;/i);
  assert.match(
    migration,
    /create or replace function pos_decrement_stock[\s\S]*set search_path = public, pg_temp/i
  );
});

test("pembayaran POS tidak mengembalikan transaksi pemenang ke request yang kalah", async () => {
  const schema = await readFile(new URL("db/schema.sql", root), "utf8");
  const migration = await readFile(
    new URL("db/migrations/0074_pos_payment_idempotency_race.sql", root),
    "utf8"
  );
  for (const sql of [schema, migration]) {
    assert.match(
      sql,
      /create or replace function pos_complete_payment[\s\S]*?if v_existing is not null then\s+return null;/i
    );
  }
  assert.match(
    migration,
    /create or replace function pos_complete_payment[\s\S]*set search_path = public, pg_temp/i
  );
  assert.match(migration, /revoke execute on function pos_complete_payment/i);
  assert.match(migration, /grant execute on function pos_complete_payment[^\n]+service_role/i);
  assert.match(
    migration,
    /pos_complete_payment[\s\S]*?status, number, pos_order_id, cashier_user_id, paid_at, withdrawable[\s\S]*?'paid', p_tx_number, p_order_id, p_cashier, now\(\), false/i
  );
  assert.match(migration, /update transactions[\s\S]*where pos_order_id is not null/i);
});

test("rollback 0073 menghapus RPC dan snapshot yang ditambahkan", async () => {
  const rollback = await readFile(
    new URL("db/migrations/0073_pos_receipt_snapshot_and_untracked_stock_rollback.sql", root),
    "utf8"
  );

  assert.match(rollback, /drop function if exists pos_create_order_with_items/i);
  assert.match(rollback, /drop function if exists pos_set_booth_enabled/i);
  assert.match(rollback, /drop column if exists paper_width_mm/i);
  assert.match(rollback, /drop column if exists print_mode/i);
  assert.match(rollback, /drop column if exists auto_print/i);
});

test("rollback 0074 mempertahankan transaksi POS non-withdrawable", async () => {
  const rollback = await readFile(
    new URL("db/migrations/0074_pos_payment_idempotency_race_rollback.sql", root),
    "utf8"
  );
  assert.match(rollback, /status, number, pos_order_id, cashier_user_id, paid_at, withdrawable/i);
  assert.match(rollback, /'paid', p_tx_number, p_order_id, p_cashier, now\(\), false/i);
});

test("migration 0082 membuka print_mode cups dan rollback menguncinya lagi", async () => {
  const schema = await readFile(new URL("db/schema.sql", root), "utf8");
  const migration = await readFile(
    new URL("db/migrations/0082_print_paths_and_output_settings.sql", root),
    "utf8"
  );
  const rollback = await readFile(
    new URL("db/migrations/0082_print_paths_and_output_settings_rollback.sql", root),
    "utf8"
  );
  for (const sql of [schema, migration]) {
    assert.match(sql, /print_mode in \('browser', 'bluetooth', 'cups'\)/i);
  }
  assert.match(migration, /drop constraint if exists pos_orders_print_mode_check/i);
  assert.match(rollback, /print_mode in \('browser', 'bluetooth'\)/i);
});

test("migration 0083 memasang kolom tunai/kembalian + check turunan, rollback membuangnya", async () => {
  const schema = await readFile(new URL("db/schema.sql", root), "utf8");
  const migration = await readFile(
    new URL("db/migrations/0083_pos_receipt_cups_and_cash_change.sql", root),
    "utf8"
  );
  const rollback = await readFile(
    new URL("db/migrations/0083_pos_receipt_cups_and_cash_change_rollback.sql", root),
    "utf8"
  );

  for (const sql of [schema, migration]) {
    assert.match(sql, /amount_received integer/i);
    assert.match(sql, /change_amount integer/i);
    assert.match(sql, /amount_received >= final_amount/i);
    assert.match(sql, /change_amount = amount_received - final_amount/i);
  }
  assert.match(migration, /add column if not exists amount_received integer/i);
  assert.match(migration, /add column if not exists change_amount integer/i);
  for (const sql of [schema, migration]) {
    assert.match(sql, /print_mode in \('browser', 'bluetooth', 'cups'\)/i);
  }
  // Uang tunai TIDAK menumpang payment_reference.
  assert.match(migration, /BUKAN menumpang `payment_reference`/i);
  assert.match(migration, /amount_received = p_amount_received/i);
  assert.match(migration, /change_amount = p_change_amount/i);

  assert.match(rollback, /drop constraint if exists pos_orders_cash_change_valid/i);
  assert.match(rollback, /drop column if exists change_amount/i);
  assert.match(rollback, /drop column if exists amount_received/i);
  assert.match(rollback, /print_mode in \('browser', 'bluetooth'\)/i);
});
