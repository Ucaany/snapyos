/**
 * Exit-PIN atomic lockout RPC (0059) — static SQL analysis.
 * Memastikan `exit_pin_register_failure` ada di schema.sql dengan signature
 * yang dipakai devices.ts, atomic increment (UPDATE ... RETURNING), dan
 * GRANT service_role. Mirip settlement-rpc.test.ts.
 * Run: npm test
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const root = new URL("../", import.meta.url)
const read = (rel: string) => readFile(new URL(rel, root), "utf8")

let schema: string
let migration: string

test("load SQL sources", async () => {
  ;[schema, migration] = await Promise.all([
    read("db/schema.sql"),
    read("db/migrations/0059_payment_settlement_hardening.sql"),
  ])
})

test("schema.sql: exit_pin_register_failure exists with correct signature", () => {
  const m = schema.match(
    /create or replace function exit_pin_register_failure\s*\(([\s\S]*?)\)\s*returns\s+table\s*\(([\s\S]*?)\)/i
  )
  assert.ok(m, "exit_pin_register_failure not found in schema.sql")
  const params = m[1] ?? ""
  const ret = m[2] ?? ""
  assert.ok(params.includes("p_photobox_id"), "missing p_photobox_id param")
  assert.ok(params.includes("p_threshold"), "missing p_threshold param")
  assert.ok(params.includes("p_lock_ms"), "missing p_lock_ms param")
  const retLow = ret.toLowerCase()
  assert.ok(retLow.includes("locked"), "missing locked return column")
  assert.ok(retLow.includes("failed_count"), "missing failed_count return column")
  assert.ok(retLow.includes("locked_until"), "missing locked_until return column")
})

test("schema.sql: RPC does atomic UPDATE ... RETURNING on photoboxes", () => {
  const body = schema.match(
    /create or replace function exit_pin_register_failure\b[\s\S]*?\$\$;/i
  )![0]
  assert.ok(
    /update\s+photoboxes\s+set\s+exit_pin_failed_count\s*=\s*exit_pin_failed_count\s*\+\s*1/i.test(body),
    "missing atomic increment UPDATE on exit_pin_failed_count"
  )
  assert.ok(body.includes("returning"), "missing RETURNING")
})

test("schema.sql: GRANT execute to service_role", () => {
  assert.ok(
    schema.match(/grant\s+execute\s+on\s+function\s+exit_pin_register_failure/i),
    "missing GRANT for exit_pin_register_failure"
  )
})

test("0059 migration: contains exit_pin_register_failure RPC", () => {
  assert.ok(
    migration.match(/create or replace function exit_pin_register_failure/i),
    "0059 migration should define exit_pin_register_failure"
  )
})

test("0059 migration: contains uq_pay_active_per_checkout partial index", () => {
  assert.ok(
    migration.match(/uq_pay_active_per_checkout/i),
    "0059 migration should create uq_pay_active_per_checkout"
  )
  assert.ok(
    migration.match(/where\s+status\s+in\s*\('creating',\s*'pending'\)/i),
    "0059 migration partial index WHERE clause missing"
  )
})
