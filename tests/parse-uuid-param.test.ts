/**
 * parseUuidParam guard — docs/03 §3.5, docs/08 §8.2.
 * Non-UUID param → 404 NOT_FOUND (bukan 400) supaya tidak membocorkan
 * keberadaan resource. Sekaligus menghilangkan non-null assertion di
 * route handler.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

import { parseUuidParam } from "../src/lib/uuid-param.ts";
import { ApiError } from "../src/lib/api-errors.ts";

const VALID = "3a3b8c74-6c48-4f92-9c58-1b3f5d0e0f0a";

test("parseUuidParam: UUID valid → return string yang sama", () => {
  assert.equal(parseUuidParam(VALID, "businessId"), VALID);
  assert.equal(parseUuidParam(VALID), VALID);
});

test("parseUuidParam: undefined/null/empty → NOT_FOUND (bukan 400)", () => {
  for (const bad of [undefined, null, ""]) {
    try {
      parseUuidParam(bad as string | undefined | null, "id");
      assert.fail(`harus melempar untuk ${JSON.stringify(bad)}`);
    } catch (error) {
      assert.ok(error instanceof ApiError);
      assert.equal((error as ApiError).code, "NOT_FOUND");
      assert.equal((error as ApiError).status, 404);
    }
  }
});

test("parseUuidParam: non-UUID string → NOT_FOUND", () => {
  for (const bad of ["abc", "123", "not-a-uuid", "3a3b8c74-6c48-4f92", VALID + "x", " " + VALID]) {
    try {
      parseUuidParam(bad, "businessId");
      assert.fail(`harus melempar untuk "${bad}"`);
    } catch (error) {
      assert.ok(error instanceof ApiError);
      assert.equal((error as ApiError).code, "NOT_FOUND");
      assert.equal((error as ApiError).status, 404);
    }
  }
});

test("parseUuidParam: pesan mengandung nama parameter", () => {
  try {
    parseUuidParam("bogus", "userId");
    assert.fail("harus melempar");
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.ok((error as ApiError).message.includes("userId"));
  }
});

test("parseUuidParam: SQL injection attempt → NOT_FOUND (tidak 500)", () => {
  const payloads = [
    "'; DROP TABLE businesses;--",
    "' OR 1=1 --",
    "../../etc/passwd",
    "<script>alert(1)</script>",
  ];
  for (const bad of payloads) {
    assert.throws(
      () => parseUuidParam(bad, "businessId"),
      (err: unknown) => err instanceof ApiError && (err as ApiError).code === "NOT_FOUND"
    );
  }
});

// ---------------------------------------------------------------------------
// M1 (security) — IDOR storage: route WAJIB cek membership + 404 cross-tenant.
// Static check (handler butuh session supabase; tak bisa dijalankan di node).
// ---------------------------------------------------------------------------

test("M1: storage route cek getMembership + cross-tenant 404", async () => {
  const src = await readFile(
    new URL("../src/app/api/v1/business/[businessId]/storage/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(src, /getMembership\s*\(\s*user\.id\s*,\s*businessId\s*\)/, "harus cek membership");
  assert.match(src, /ApiError\s*\(\s*["']NOT_FOUND["']/, "cross-tenant → NOT_FOUND (404)");
  assert.match(src, /can\s*\(\s*membership\.role\s*,\s*["']business:read["']\s*\)/, "harus cek permission");
});
