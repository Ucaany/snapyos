/**
 * C1 (CRITICAL) — RLS coverage static check.
 * Setiap `create table` di db/schema.sql harus punya `enable row level security`.
 * Gagal bila ada tabel yang terlewat (blast radius PostgREST lewat anon/auth).
 * Juga memastikan tidak ada policy yang membuka `to public/anon/authenticated`.
 * Run: npm test
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

let schema: string;
let migration: string;

test("load SQL sources", async () => {
  [schema, migration] = await Promise.all([
    readFile(new URL("db/schema.sql", root), "utf8"),
    readFile(new URL("db/migrations/0064_enable_rls_all_tables.sql", root), "utf8"),
  ]);
});

function tableNames(sql: string): string[] {
  const set = new Set<string>();
  const re = /create table (?:if not exists )?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  for (const m of sql.matchAll(re)) set.add(m[1]!.toLowerCase());
  return [...set];
}

test("schema.sql: setiap tabel punya enable row level security", () => {
  const tables = tableNames(schema);
  assert.ok(tables.length >= 50, `expected many tables, got ${tables.length}`);
  const missing = tables.filter(
    (t) =>
      !new RegExp(`alter table (?:if exists )?${t} enable row level security`, "i").test(schema)
  );
  assert.deepEqual(missing, [], `tabel tanpa RLS: ${missing.join(", ")}`);
});

test("schema.sql: tidak ada policy to public/anon/authenticated", () => {
  // pernyataan policy satu baris; periksa tiap baris create policy.
  const open = schema
    .split("\n")
    .filter((l) => /create policy/i.test(l))
    .filter((l) => /\bto\s+(public|anon|authenticated)\b/i.test(l));
  assert.deepEqual(open, [], `policy terbuka ditemukan: ${open.join(" | ")}`);
});

test("schema.sql: policy svc_all untuk service_role pada tiap tabel", () => {
  const tables = tableNames(schema);
  const policies = [...schema.matchAll(/create policy svc_all on ([a-z_]+)/gi)].map((m) =>
    m[1]!.toLowerCase()
  );
  const uniquePolicies = new Set(policies);
  const missing = tables.filter((t) => !uniquePolicies.has(t));
  assert.deepEqual(missing, [], `tabel tanpa policy svc_all: ${missing.join(", ")}`);
});

test("0064 migration: idempotent + daftar tabel cocok schema", () => {
  // migration memakai array literal di dalam DO block; ekstrak string quoted.
  const migList = [...migration.matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1]!.toLowerCase());
  const migTables = new Set(migList);
  const schemaTables = tableNames(schema);
  const missing = schemaTables.filter((t) => !migTables.has(t));
  assert.deepEqual(missing, [], `0064 kehilangan tabel: ${missing.join(", ")}`);
  assert.ok(/enable row level security/i.test(migration));
  assert.ok(migration.includes("svc_all"));
});

test("0064 rollback: mematikan RLS & policy svc_all", async () => {
  const rollback = await readFile(
    new URL("db/migrations/0064_enable_rls_all_tables_rollback.sql", root),
    "utf8"
  );
  assert.ok(/drop policy if exists svc_all/i.test(rollback));
  assert.ok(/disable row level security/i.test(rollback));
});
