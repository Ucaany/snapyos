/**
 * Pin `search_path` RPC (0071) — defense-in-depth.
 *
 * Statis (tanpa Postgres): memastikan setiap RPC aplikasi punya search_path
 * terpin, dan migrasi 0071 + rollback-nya menyebut himpunan fungsi yang SAMA
 * PERSIS. Drift di antara ketiganya adalah mode kegagalan yang nyata: fungsi
 * baru ditambah ke schema.sql tapi lupa dipin, atau rollback tertinggal satu
 * nama sehingga `reset` tidak pernah jalan.
 *
 * Dua bentuk pin yang sah:
 *  - inline: `set search_path` di dalam definisi fungsi (0052/0069).
 *  - alter : `alter function ... set search_path` setelah definisi (0071).
 *
 * Catatan: migrasi 0071 BELUM di-apply ke Supabase (keputusan audit) — tes ini
 * memvalidasi teks SQL, bukan hasil eksekusi. Lihat docs/18-audit-report.md.
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
    readFile(new URL("db/migrations/0071_rpc_search_path_hardening.sql", root), "utf8"),
    readFile(new URL("db/migrations/0071_rpc_search_path_hardening_rollback.sql", root), "utf8"),
  ]);
});

/** Fungsi trigger bukan RPC — tidak perlu (dan tidak boleh) dipin. */
function isTrigger(name: string): boolean {
  return name === "set_updated_at" || name.startsWith("tg_");
}

/** Nama fungsi aplikasi (bukan trigger) yang didefinisikan di sumber SQL. */
function appFunctionNames(sql: string): string[] {
  const names = new Set<string>();
  for (const m of sql.matchAll(/create or replace function\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
    if (!isTrigger(m[1]!)) names.add(m[1]!);
  }
  return [...names].sort();
}

/** Nilai `set search_path` inline pada definisi fungsi (0052/0069), atau null. */
function inlineSearchPath(sql: string, name: string): string | null {
  const at = sql.search(new RegExp(`create or replace function\\s+${name}\\s*\\(`, "i"));
  assert.ok(at >= 0, `${name} tidak ada di sumber`);
  const rest = sql.slice(at);
  const bodyAt = rest.indexOf("$$");
  const header = bodyAt > 0 ? rest.slice(0, bodyAt) : rest;
  const m = header.match(/set\s+search_path\s*=\s*([^\n;]+)/i);
  return m ? m[1]!.replace(/\s+/g, " ").trim().replace(/,$/, "") : null;
}

/** Nama fungsi yang punya `set search_path` DI DALAM definisinya. */
function inlinePinned(sql: string): string[] {
  return appFunctionNames(sql)
    .filter((n) => inlineSearchPath(sql, n) !== null)
    .sort();
}

/** Nama fungsi yang di-`alter function` oleh sebuah file. */
function alteredNames(sql: string): string[] {
  const names = new Set<string>();
  for (const m of sql.matchAll(/alter function\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
    names.add(m[1]!);
  }
  return [...names].sort();
}

test("schema.sql: setiap RPC aplikasi terpin — inline ATAU lewat `alter function`", () => {
  const all = appFunctionNames(schema);
  assert.ok(all.length >= 20, `expected many app functions, got ${all.length}`);
  const pinned = new Set([...inlinePinned(schema), ...alteredNames(schema)]);
  const missing = all.filter((n) => !pinned.has(n));
  assert.deepEqual(missing, [], `RPC tanpa search_path: ${missing.join(", ")}`);
});

test("schema.sql: seluruh pin efektif berbunyi 'public, pg_temp'", () => {
  // Pin inline yang benar-benar berlaku (yang kemudian di-alter boleh berbeda —
  // bootstrap_admin `public` → `public, pg_temp`; itu diuji di bawah).
  const altered = new Set(alteredNames(schema));
  for (const n of appFunctionNames(schema)) {
    if (altered.has(n)) continue;
    assert.equal(inlineSearchPath(schema, n), "public, pg_temp", `${n}: pin inline tak terduga`);
  }
  for (const m of schema.matchAll(/alter function[^\n]*set\s+search_path\s*=\s*([^\n;]+)/gi)) {
    assert.equal(
      m[1]!.replace(/\s+/g, " ").trim(),
      "public, pg_temp",
      `alter search_path: ${m[1]}`
    );
  }
});

test("schema.sql: bootstrap_admin di-alter (pin inline-nya hanya 'public')", () => {
  assert.equal(inlineSearchPath(schema, "bootstrap_admin"), "public");
  assert.ok(alteredNames(schema).includes("bootstrap_admin"));
});

test("0071: mem-pin semua RPC yang belum terpin inline 0069", () => {
  const inline0069 = [
    "add_business_member_with_quota",
    "create_outlet_with_quota",
    "create_photobox_with_quota",
    "pos_create_order_with_items",
    "pos_decrement_stock_batch",
    "pos_set_booth_enabled",
  ];
  const expected = appFunctionNames(schema)
    .filter((n) => !inline0069.includes(n))
    .sort();
  assert.deepEqual(alteredNames(migration), expected);
});

test("0071: memakai `alter function`, bukan `create or replace` (anti drift body)", () => {
  assert.ok(
    !/create or replace function/i.test(migration),
    "0071 harus `alter function`, bukan menyalin ulang body"
  );
  const sets = migration.match(/set search_path = public, pg_temp/gi) ?? [];
  assert.equal(sets.length, alteredNames(migration).length);
});

test("0071 rollback: menyentuh himpunan yang SAMA PERSIS dengan forward", () => {
  assert.deepEqual(alteredNames(rollback), alteredNames(migration));
  // Setiap `alter function` di rollback harus diakhiri aksi reset/set.
  const stmts = rollback.match(/alter function[^;]+;/gi) ?? [];
  assert.equal(stmts.length, alteredNames(rollback).length);
  for (const s of stmts) {
    assert.match(s, /reset search_path|set search_path = public\b/i, `tanpa aksi: ${s}`);
  }
});

test("0071 rollback: pin inline 0069 TIDAK di-reset (bukan berasal dari 0071)", () => {
  // Ketiga ini sudah `set search_path = public, pg_temp` di definisi aslinya;
  // `reset` atas mereka akan mengubah perilaku yang bukan berasal dari 0071.
  const inline = inlinePinned(schema);
  assert.deepEqual(inline, [
    "add_business_member_with_quota",
    "bootstrap_admin",
    "create_outlet_with_quota",
    "create_photobox_with_quota",
    "pos_create_order_with_items",
    "pos_decrement_stock_batch",
    "pos_set_booth_enabled",
  ]);
  const reset = [
    ...rollback.matchAll(/alter function\s+([a-z_][a-z0-9_]*)\s*\([^)]*\)\s*reset/gi),
  ].map((m) => m[1]!);
  const touched = reset.filter((n) => inline.includes(n));
  assert.deepEqual(touched, [], `rollback tidak boleh me-reset: ${touched.join(", ")}`);
});

test("0071 rollback: bootstrap_admin dikembalikan ke 'public', bukan di-reset", () => {
  assert.match(rollback, /alter function bootstrap_admin\(text\)\s+set search_path = public;/i);
  assert.ok(
    !/alter function bootstrap_admin\([^)]*\)\s*reset/i.test(rollback),
    "reset akan menghapus pin asli 0052"
  );
});

test("0071: transaksional + punya post-check assert", () => {
  assert.match(migration, /^\s*begin;/m);
  assert.match(migration, /^\s*commit;/m);
  assert.match(migration, /ASSERT FAIL/);
});
