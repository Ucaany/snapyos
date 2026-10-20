/**
 * Kuota resource atomik (0069) — audit lintas-potong.
 * Static SQL analysis: RPC harus mengunci sebelum menghitung, memakai
 * search_path eksplisit, hanya service_role, dan rollback harus cocok.
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
    readFile(new URL("db/migrations/0069_atomic_resource_quotas.sql", root), "utf8"),
    readFile(new URL("db/migrations/0069_atomic_resource_quotas_rollback.sql", root), "utf8"),
  ]);
});

const FUNCTIONS = [
  "create_outlet_with_quota",
  "create_photobox_with_quota",
  "add_business_member_with_quota",
];

function functionBody(source: string, fn: string): string {
  const start = source.indexOf(`function ${fn}(`);
  assert.ok(start > 0, `${fn} tidak ditemukan`);
  const rest = source.slice(start);
  const end = rest.indexOf("$$;", rest.indexOf("$$"));
  return end > 0 ? rest.slice(0, end) : rest;
}

test("schema.sql + migration: RPC kuota ada dengan advisory lock sebelum count", () => {
  for (const source of [schema, migration]) {
    for (const fn of FUNCTIONS) {
      assert.match(source, new RegExp(`create or replace function ${fn}\\s*\\(`, "i"));
      const body = functionBody(source, fn);
      const lockAt = body.indexOf("pg_advisory_xact_lock");
      const countAt = body.indexOf("select count(*)");
      assert.ok(lockAt > 0, `${fn} harus mengambil advisory lock`);
      assert.ok(countAt > lockAt, `${fn} harus menghitung setelah lock`);
    }
  }
});

test("RPC kuota: SECURITY DEFINER + search_path eksplisit + error deterministik", () => {
  for (const fn of FUNCTIONS) {
    const scoped = functionBody(migration, fn);
    assert.match(scoped, /security definer/i, `${fn} harus security definer`);
    assert.match(scoped, /set search_path = public, pg_temp/i, `${fn} harus set search_path`);
    assert.match(scoped, /PLAN_LIMIT_REACHED/, `${fn} harus raise PLAN_LIMIT_REACHED`);
  }
});

test("RPC kuota: staff menghitung manager + staff, bukan owner", () => {
  const body = functionBody(migration, "add_business_member_with_quota");
  assert.match(body, /role in \('manager', 'staff'\)/);
  assert.doesNotMatch(body, /role in \('owner'/);
});

test("RPC kuota: hanya service_role yang boleh execute", () => {
  for (const fn of FUNCTIONS) {
    assert.match(
      migration,
      new RegExp(`revoke execute on function ${fn}[\\s\\S]*?from public, anon, authenticated`, "i")
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function ${fn}[\\s\\S]*?to service_role`, "i")
    );
    assert.match(schema, new RegExp(`revoke execute on function ${fn}`, "i"));
    assert.match(schema, new RegExp(`grant execute on function ${fn}`, "i"));
  }
});

test("rollback 0069 menghapus RPC dengan signature yang sama", () => {
  assert.match(
    rollback,
    /drop function if exists create_outlet_with_quota\(uuid, integer, text, text, text, text, text\)/
  );
  assert.match(
    rollback,
    /drop function if exists create_photobox_with_quota\(uuid, integer, jsonb\)/
  );
  assert.match(
    rollback,
    /drop function if exists add_business_member_with_quota\(uuid, integer, uuid, text\)/
  );
});
