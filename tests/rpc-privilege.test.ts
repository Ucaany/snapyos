/**
 * H1 (security) — setiap `create function` aplikasi harus di-lock ke
 * service_role (revoke dari public/anon/authenticated + grant service_role).
 * Fungsi trigger (set_updated_at, tg_*) dikecualikan — bukan RPC.
 * Static SQL analysis (mirip exit-pin-rpc.test.ts).
 * Run: npm test
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

let schema: string;
let migration: string;
let rollback: string;

test("load SQL sources", async () => {
  [schema, migration, rollback] = await Promise.all([
    readFile(new URL("db/schema.sql", root), "utf8"),
    readFile(new URL("db/migrations/0065_lock_priviledged_rpcs.sql", root), "utf8"),
    readFile(new URL("db/migrations/0065_lock_priviledged_rpcs_rollback.sql", root), "utf8"),
  ]);
});

/** Nama fungsi aplikasi (bukan trigger). */
function appFunctionNames(sql: string): string[] {
  const names = new Set<string>();
  const re = /create or replace function\s+([a-z_][a-z0-9_]*)\s*\(/gi;
  for (const m of sql.matchAll(re)) {
    const name = m[1]!;
    if (name === "set_updated_at" || name.startsWith("tg_")) continue;
    names.add(name);
  }
  return [...names];
}

test("schema.sql: setiap fungsi aplikasi punya revoke execute", () => {
  const names = appFunctionNames(schema);
  assert.ok(names.length >= 20, `expected many functions, got ${names.length}`);
  const missing = names.filter(
    (n) => !new RegExp(`revoke execute on function ${n}\\s*\\(`, "i").test(schema)
  );
  assert.deepEqual(missing, [], `fungsi tanpa revoke: ${missing.join(", ")}`);
});

test("schema.sql: setiap fungsi aplikasi punya grant to service_role", () => {
  const names = appFunctionNames(schema);
  const missing = names.filter(
    (n) =>
      !new RegExp(`grant execute on function ${n}\\s*\\([\\s\\S]*?to service_role`, "i").test(
        schema
      )
  );
  assert.deepEqual(missing, [], `fungsi tanpa grant service_role: ${missing.join(", ")}`);
});

test("schema.sql: signature lock lengkap (tipe argumen persis, bukan nama saja)", () => {
  // pos_complete_payment punya 12 argumen (0083 + tunai/kembalian) — tipe persis tertulis.
  assert.match(
    schema,
    /revoke execute on function pos_complete_payment\(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer, integer, integer\)/i
  );
  assert.match(
    schema,
    /grant execute on function pos_complete_payment\(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer, integer, integer\) to service_role/i
  );
  assert.match(schema, /revoke execute on function storage_account_sub\(uuid, text\[\]\)/i);
});

test("0065 migration: men-lock RPC inti + rollback membukanya", () => {
  for (const fn of [
    "pos_complete_payment",
    "pos_decrement_stock",
    "storage_account_add",
    "storage_account_sub",
  ]) {
    assert.ok(
      new RegExp(`grant execute on function ${fn}`, "i").test(migration),
      `0065 harus men-lock ${fn}`
    );
    assert.ok(
      new RegExp(`grant execute on function ${fn}`, "i").test(rollback),
      `rollback 0065 harus membuka ${fn}`
    );
  }
});
