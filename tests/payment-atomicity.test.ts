import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = new URL("../db/migrations/0031_payment_settlement_atomicity.sql", import.meta.url)

test("payment atomicity migration locks and uniquely binds every paid side effect", async () => {
  const sql = await readFile(migration, "utf8")
  for (const invariant of [
    "uq_checkout_open_per_photobox",
    "uq_transaction_payment",
    "uq_voucher_usage_payment",
    "uq_ledger_payment_source",
    "settle_paid_payment_atomically",
    "create_voucher_payment_atomically",
    "for update",
  ]) {
    assert.match(sql, new RegExp(invariant, "i"))
  }
})

// H3 — idempotency state-aware: payment_webhooks mendukung status 'received'
// (non-authoritative, dipromosikan setelah settle).
test("H3: payment_webhooks menerima status 'received' (schema + migration 0066)", async () => {
  const [schema, mig, rollback] = await Promise.all([
    readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/0066_webhook_status_received.sql", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/0066_webhook_status_received_rollback.sql", import.meta.url), "utf8"),
  ])
  assert.match(schema, /status in \('received', 'processed', 'ignored', 'error'\)/i)
  assert.match(mig, /'received'/i)
  // Rollback AMAN: demote 'received' → 'error' (bukan delete) lalu sempitkan CHECK.
  assert.match(rollback, /update payment_webhooks set status = 'error' where status = 'received'/i)
  assert.doesNotMatch(rollback, /delete from payment_webhooks/i)
})
