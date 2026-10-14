/**
 * Redaksi log lintas-potong — docs/09 (secret tidak boleh bocor ke log).
 * Satu implementasi dipakai API error dan webhook persistence.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  redactEmailString,
  redactSensitive,
  redactWebhookPayload,
} from "../src/lib/error-redaction.ts";

test("redactSensitive: key sensitif diganti [REDACTED]", () => {
  const out = redactSensitive({
    server_key: "server-secret",
    signature: "abc123",
    qr_string: "00020101",
    authorization: "Bearer tok",
    password: "p",
    nested: { private_key: "private-secret", amount: 1000 },
  }) as Record<string, unknown>;
  assert.equal(out.server_key, "[REDACTED]");
  assert.equal(out.signature, "[REDACTED]");
  assert.equal(out.qr_string, "[REDACTED]");
  assert.equal(out.authorization, "[REDACTED]");
  assert.equal(out.password, "[REDACTED]");
  assert.equal((out.nested as Record<string, unknown>).private_key, "[REDACTED]");
  assert.equal((out.nested as Record<string, unknown>).amount, 1000);
});

test("redactSensitive: email di dalam string dimask, domain dipertahankan", () => {
  assert.equal(redactEmailString("gagal untuk budi@example.com"), "gagal untuk ***@example.com");
  const out = redactSensitive({ note: "kontak owner@snapy.id" }) as Record<string, unknown>;
  assert.equal(out.note, "kontak ***@snapy.id");
});

test("redactSensitive: Error diubah menjadi objek aman tanpa kehilangan pesan", () => {
  const out = redactSensitive(new Error("gagal budi@example.com")) as unknown as Record<
    string,
    unknown
  >;
  assert.equal(out.name, "Error");
  assert.equal(out.message, "gagal ***@example.com");
});

test("redactWebhookPayload: alias kompatibel memakai implementasi kuat", () => {
  const out = redactWebhookPayload({ signature: "sig", qr_string: "qr", other: 1 }) as Record<
    string,
    unknown
  >;
  assert.equal(out.signature, "[REDACTED]");
  assert.equal(out.qr_string, "[REDACTED]");
  assert.equal(out.other, 1);
  assert.equal(redactWebhookPayload, redactSensitive);
});
