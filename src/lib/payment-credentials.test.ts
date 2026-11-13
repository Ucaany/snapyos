import test from "node:test";
import assert from "node:assert/strict";

import {
  assertActiveCredentialLimit,
  isActiveCredentialLimitError,
} from "./payment-credentials.ts";

void test("O-012: error trigger DB dipetakan ke batas credential aktif", () => {
  assert.equal(
    isActiveCredentialLimitError({
      code: "P0001",
      message: "ACTIVE_PAYMENT_CREDENTIAL_LIMIT",
    }),
    true
  );
  assert.equal(isActiveCredentialLimitError({ code: "23505", message: "duplicate" }), false);
  assert.equal(isActiveCredentialLimitError(null), false);
});

void test("O-012: aktivasi credential ke-3 ditolak", () => {
  assert.doesNotThrow(() => assertActiveCredentialLimit(0));
  assert.doesNotThrow(() => assertActiveCredentialLimit(1));
  assert.throws(() => assertActiveCredentialLimit(2), /Maksimal 2/);
});
