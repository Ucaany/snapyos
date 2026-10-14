/**
 * R2/S3 "objek tidak ada" classifier — pure.
 * Dipakai bersama oleh `head()` dan jalur `upload({ upsert:false })`. Kalau
 * classifier ini terlalu longgar, error non-404 (403/5xx/timeout) dianggap
 * "key belum ada" → PutObject menimpa objek yang sudah ada.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { isObjectNotFoundError } from "../src/lib/r2/errors.ts";

test("isObjectNotFoundError: 404 via $metadata → true", () => {
  assert.equal(isObjectNotFoundError({ $metadata: { httpStatusCode: 404 } }), true);
});

test("isObjectNotFoundError: name NotFound / NoSuchKey → true", () => {
  assert.equal(isObjectNotFoundError({ name: "NotFound" }), true);
  assert.equal(isObjectNotFoundError({ name: "NoSuchKey" }), true);
  assert.equal(isObjectNotFoundError({ Code: "NoSuchKey" }), true);
});

test("isObjectNotFoundError: 403 / 500 / timeout → false (bukan 'tidak ada')", () => {
  assert.equal(isObjectNotFoundError({ $metadata: { httpStatusCode: 403 } }), false);
  assert.equal(isObjectNotFoundError({ $metadata: { httpStatusCode: 500 } }), false);
  assert.equal(isObjectNotFoundError({ name: "TimeoutError" }), false);
  assert.equal(isObjectNotFoundError(new Error("socket hang up")), false);
});

test("isObjectNotFoundError: nilai non-error → false", () => {
  assert.equal(isObjectNotFoundError(null), false);
  assert.equal(isObjectNotFoundError(undefined), false);
  assert.equal(isObjectNotFoundError("404"), false);
});
