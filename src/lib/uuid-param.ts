/**
 * UUID param guard — pure module (tanpa import next/*) agar bisa di-unit-test.
 * Non-UUID → 404 NOT_FOUND (bukan 400) supaya tidak membocorkan keberadaan
 * resource; konsisten dengan aturan cross-tenant docs/03 §3.5.
 * Menghilangkan kebutuhan non-null assertion (`businessId!`) di route
 * handler — nilai return dijamin string UUID non-empty.
 */

import { z } from "zod";

import { ApiError } from "./api-errors.ts";

// guid() = bentuk 8-4-4-4-12 hex, sama dengan tipe `uuid` Postgres.
// BUKAN z.string().uuid() yang menerapkan RFC 4122 versi/variant ketat —
// itu menolak UUID deterministik di seed-dev.sql (mis. 11111111-...),
// padahal sah di kolom Postgres `uuid` (source of truth).
const UUID_SCHEMA = z.string().guid();

export function parseUuidParam(value: string | undefined | null, name = "id"): string {
  const parsed = UUID_SCHEMA.safeParse(value ?? "");
  if (!parsed.success) {
    throw new ApiError("NOT_FOUND", `Parameter ${name} tidak valid`);
  }
  return parsed.data;
}
