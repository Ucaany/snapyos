/**
 * Finalize kiosk: body kebesaran wajib 413, bukan 422 (audit kiosk K1-K16).
 * Validator diuji langsung; pemetaan status di route dijaga sebagai teks
 * sumber karena route menyentuh `next/server` + `server-only`.
 * Run: npm test
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { API_ERRORS, ApiError } from "../src/lib/api-errors.ts";
import {
  FINALIZE_MAX_REQUEST_BYTES,
  FINALIZE_TOO_LARGE_MESSAGE,
  isFinalizeRequestTooLarge,
  validateFinalizeRequest,
} from "../src/lib/upload-validation.ts";

const root = new URL("../", import.meta.url);

async function src(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

const ROUTE = "src/app/api/v1/public/[businessSlug]/sessions/[id]/finalize/route.ts";

test("API_ERRORS: PAYLOAD_TOO_LARGE = 413", () => {
  assert.equal(API_ERRORS.PAYLOAD_TOO_LARGE, 413);
  // ApiError harus membawa status 413 dari peta yang sama, bukan literal.
  assert.equal(new ApiError("PAYLOAD_TOO_LARGE", FINALIZE_TOO_LARGE_MESSAGE).status, 413);
});

test("pesan customer tidak berubah", () => {
  assert.equal(FINALIZE_TOO_LARGE_MESSAGE, "Ukuran total foto melebihi batas 50 MB");
});

test("isFinalizeRequestTooLarge: batas 50 MB inklusif", () => {
  assert.equal(isFinalizeRequestTooLarge(FINALIZE_MAX_REQUEST_BYTES), false);
  assert.equal(isFinalizeRequestTooLarge(FINALIZE_MAX_REQUEST_BYTES + 1), true);
  // Nilai tak wajar ikut ditolak, bukan lolos ke jalur upload.
  assert.equal(isFinalizeRequestTooLarge(-1), true);
  assert.equal(isFinalizeRequestTooLarge(Number.NaN), true);
  assert.equal(isFinalizeRequestTooLarge(Number.POSITIVE_INFINITY), true);
});

test("validateFinalizeRequest: kebesaran total vs jumlah foto tidak valid", () => {
  // Total byte kebesaran → pesan kebesaran (dipetakan route ke 413).
  assert.equal(validateFinalizeRequest(FINALIZE_MAX_REQUEST_BYTES + 1, 3), FINALIZE_TOO_LARGE_MESSAGE);
  // Jumlah foto salah → pesan berbeda, tetap 422.
  assert.equal(validateFinalizeRequest(1024, 0), "Jumlah foto tidak valid");
  assert.equal(validateFinalizeRequest(1024, 51), "Jumlah foto tidak valid");
  assert.equal(validateFinalizeRequest(10 * 1024 * 1024, 3), null);
});

test("route finalize: body kebesaran memakai PAYLOAD_TOO_LARGE, bukan VALIDATION_ERROR", async () => {
  const s = await src(ROUTE);
  assert.ok(
    s.includes('new ApiError("PAYLOAD_TOO_LARGE"'),
    "requestTooLarge wajib memakai ApiError PAYLOAD_TOO_LARGE (status 413 dari API_ERRORS)"
  );
  assert.ok(
    s.includes("FINALIZE_TOO_LARGE_MESSAGE"),
    "pesan kebesaran wajib dari konstanta bersama, agar dua jalur tidak menyimpang"
  );
  // Jalur total byte (tanpa Content-Length) juga harus memetakan ke 413.
  assert.ok(
    s.includes("isFinalizeRequestTooLarge(totalBytes)"),
    "validateFiles wajib menandai total byte kebesaran secara struktural"
  );
  assert.ok(
    s.includes("result.tooLarge ? requestTooLarge() : uploadInvalid(result.message)"),
    "pemetaan 413 vs 422 wajib satu tempat dan eksplisit"
  );
});

test("route finalize: tidak ada 422 tersisa di jalur body kebesaran", async () => {
  const s = await src(ROUTE);
  // requestTooLarge() adalah satu-satunya respons body kebesaran; ia tidak
  // boleh lagi mengembalikan VALIDATION_ERROR.
  const helper = s.slice(s.indexOf("function requestTooLarge"), s.indexOf("function uploadInvalid"));
  assert.ok(!helper.includes("VALIDATION_ERROR"), "requestTooLarge tidak boleh 422/VALIDATION_ERROR");
  assert.ok(helper.includes('"PAYLOAD_TOO_LARGE"'), "requestTooLarge wajib PAYLOAD_TOO_LARGE");
});
