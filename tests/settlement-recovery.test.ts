import assert from "node:assert/strict";
import { test } from "node:test";

import { needsSettlementRecovery } from "../src/server/payment/settlement-recovery.ts";

test("needsSettlementRecovery: transaksi tercatat + checkout paid → tidak perlu re-run", () => {
  assert.equal(
    needsSettlementRecovery({ transaction_id: "tx-123", checkout_status: "paid" }),
    false
  );
});

test("needsSettlementRecovery: transaction_id null → re-run (side effects belum jadi)", () => {
  assert.equal(needsSettlementRecovery({ transaction_id: null, checkout_status: "paid" }), true);
});

test("needsSettlementRecovery: transaction_id string kosong → dianggap belum tercatat", () => {
  assert.equal(needsSettlementRecovery({ transaction_id: "", checkout_status: "paid" }), true);
  assert.equal(needsSettlementRecovery({ transaction_id: undefined, checkout_status: "paid" }), true);
});

test("needsSettlementRecovery: checkout belum paid → re-run (transisi checkout tertinggal)", () => {
  assert.equal(
    needsSettlementRecovery({ transaction_id: "tx-123", checkout_status: "open" }),
    true
  );
  assert.equal(
    needsSettlementRecovery({ transaction_id: "tx-123", checkout_status: "expired" }),
    true
  );
});

test("needsSettlementRecovery: status checkout tidak diketahui (null/undefined) → fail-safe re-run", () => {
  assert.equal(needsSettlementRecovery({ transaction_id: "tx-123", checkout_status: null }), true);
  assert.equal(
    needsSettlementRecovery({ transaction_id: "tx-123", checkout_status: undefined }),
    true
  );
});

test("needsSettlementRecovery: kedua efek hilang (expired recovery penuh) → re-run", () => {
  assert.equal(needsSettlementRecovery({ transaction_id: null, checkout_status: "expired" }), true);
});
