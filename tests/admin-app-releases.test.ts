/**
 * Phase 11 — katalog aplikasi admin (`/admin/apps`, migration 0081).
 *
 * Yang dikunci: rilis hanya berupa TAUTAN (tidak ada upload/bucket), versi
 * duplikat jadi error field (bukan 500), skema URL berbahaya ditolak, sha256
 * wajib 64 hex, guard admin di setiap fungsi, dan hapus tidak menyentuh storage.
 *
 * Dual-runner: `npm test` memakai node:test, file ini juga jalan di
 * `npx vitest run`. Assertion memakai node:assert agar sama di kedua runner.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { appReleaseSchema, appReleaseWriteError } from "../src/lib/validators.ts";

type TestFn = (name: string, fn: () => void) => unknown;
const test: TestFn = (
  process.env.VITEST ? (await import("vitest")).test : (await import("node:test")).test
) as TestFn;

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const BASE = {
  version: "1.2.3",
  download_url: "https://drive.google.com/file/d/abc123/view",
  file_name: "snapyos-booth-1.2.3-setup.exe",
};

// ---------------------------------------------------------------------------
// Versi duplikat → error field, bukan 500
// ---------------------------------------------------------------------------
test("versi duplikat: 23505 dipetakan ke error field `version`", () => {
  const mapped = appReleaseWriteError({ code: "23505" }, "Gagal menyimpan rilis aplikasi");
  assert.equal(mapped.code, "VALIDATION_ERROR");
  assert.ok(mapped.fieldErrors?.version?.[0], "harus ada pesan di field version");
  assert.match(mapped.fieldErrors!.version![0]!, /sudah terdaftar/);
});

test("error lain tetap INTERNAL, bukan pura-pura validasi", () => {
  const mapped = appReleaseWriteError({ code: "08006" }, "Gagal menyimpan rilis aplikasi");
  assert.equal(mapped.code, "INTERNAL");
  assert.equal(mapped.fieldErrors, undefined);
});

test("apps.ts memakai pemetaan itu untuk insert dan update", () => {
  const src = read("src/server/admin/apps.ts");
  const calls = src.match(/writeError\(error, /g) ?? [];
  assert.equal(calls.length, 2, "create + update sama-sama lewat writeError");
  assert.doesNotMatch(src, /error\.code === "23505"[\s\S]{0,80}INTERNAL/);
});

// ---------------------------------------------------------------------------
// URL: hanya https:// dengan hostname publik
// ---------------------------------------------------------------------------
test("URL berbahaya ditolak: javascript:, data:, file:, http:", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///C:/Windows/System32/calc.exe",
    "http://drive.google.com/file/d/abc",
    "ftp://example.com/a.exe",
  ]) {
    const result = appReleaseSchema.safeParse({ ...BASE, download_url: url });
    assert.equal(result.success, false, `harus ditolak: ${url}`);
  }
});

test("hostname kosong atau tanpa titik ditolak", () => {
  for (const url of ["https:///file", "https://localhost/a.exe", "https://.com/a"]) {
    assert.equal(
      appReleaseSchema.safeParse({ ...BASE, download_url: url }).success,
      false,
      `harus ditolak: ${url}`
    );
  }
});

test("URL Drive valid diterima apa adanya (tanpa normalisasi)", () => {
  const url = "https://drive.google.com/file/d/1AbC-x_y/view?usp=sharing";
  assert.equal(appReleaseSchema.parse({ ...BASE, download_url: url }).download_url, url);
  const host = "https://cdn.snapyos.id/rilis/booth-1.2.3.exe";
  assert.equal(appReleaseSchema.parse({ ...BASE, download_url: host }).download_url, host);
});

// ---------------------------------------------------------------------------
// sha256 & ukuran
// ---------------------------------------------------------------------------
test("sha256 bukan 64 hex ditolak; hex valid diterima lowercase", () => {
  for (const sha of ["abc", "z".repeat(64), "a".repeat(63), "a".repeat(65)]) {
    assert.equal(
      appReleaseSchema.safeParse({ ...BASE, sha256: sha }).success,
      false,
      `harus ditolak: ${sha}`
    );
  }
  assert.equal(appReleaseSchema.parse({ ...BASE, sha256: "A".repeat(64) }).sha256, "a".repeat(64));
});

test("sha256 & ukuran boleh kosong (null) — tautan eksternal tidak diperiksa server", () => {
  const parsed = appReleaseSchema.parse({ ...BASE, sha256: null, file_size_bytes: null });
  assert.equal(parsed.sha256, null);
  assert.equal(parsed.file_size_bytes, null);
  assert.equal(appReleaseSchema.parse(BASE).sha256, undefined);
});

test("ukuran 0 / negatif / pecahan ditolak", () => {
  for (const size of [0, -1, 1.5]) {
    assert.equal(
      appReleaseSchema.safeParse({ ...BASE, file_size_bytes: size }).success,
      false,
      `harus ditolak: ${size}`
    );
  }
});

test("ukuran non-angka dari form → pesan Indonesia, bukan pesan mentah Zod", () => {
  const result = appReleaseSchema.safeParse({ ...BASE, file_size_bytes: Number.NaN });
  assert.equal(result.success, false);
  assert.match(result.error!.issues[0]!.message, /Ukuran harus angka bulat byte/);
});

test("versi harus 1.2.3 tanpa awalan v", () => {
  assert.equal(appReleaseSchema.safeParse({ ...BASE, version: "v1.2.3" }).success, false);
  assert.equal(appReleaseSchema.safeParse({ ...BASE, version: "1.2" }).success, false);
  assert.equal(appReleaseSchema.safeParse({ ...BASE, version: "1.2.3-beta" }).success, false);
});

// ---------------------------------------------------------------------------
// Guard admin + tidak ada storage (source inspection: modul server-only)
// ---------------------------------------------------------------------------
test("setiap fungsi katalog memanggil requireAdmin (non-admin → 403)", () => {
  const src = read("src/server/admin/apps.ts");
  const exported = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
  assert.deepEqual(exported.sort(), [
    "createAppRelease",
    "deleteAppRelease",
    "listAppReleases",
    "setAppReleaseActive",
    "updateAppRelease",
  ]);
  const guards = src.match(/await requireAdmin\(\)/g) ?? [];
  assert.equal(guards.length, exported.length, "satu requireAdmin per fungsi, tanpa pengecualian");
  assert.match(src, /from "\.\/guard"/);
});

test("tidak ada upload/bucket/presigned PUT: modul tidak menyentuh storage atau R2", () => {
  // Komentar boleh menyebut nama modul yang tidak dipakai; yang diperiksa kode.
  const src = read("src/server/admin/apps.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of ["storage", "r2", "bucket", "presign", "upload"]) {
    assert.equal(
      src.toLowerCase().includes(forbidden),
      false,
      `apps.ts tidak boleh menyebut ${forbidden}`
    );
  }
});

test("hapus hanya menghapus baris app_releases", () => {
  const src = read("src/server/admin/apps.ts");
  const del = src.slice(src.indexOf("export async function deleteAppRelease"));
  assert.match(del, /from\("app_releases"\)\s*\n?\s*\.delete\(\)/);
  // Satu-satunya tabel yang disentuh fungsi hapus adalah app_releases.
  const tables = [...del.matchAll(/from\("(\w+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(tables, ["app_releases"]);
});

test("migration belum diterapkan: list kosong, bukan 500", () => {
  const src = read("src/server/admin/apps.ts");
  assert.match(src, /isMissingRelation\(error\)\) return \[\]/);
});

test("migration 0081 ada + rollback terpisah + tercatat di schema.sql", () => {
  const up = read("db/migrations/0081_app_releases.sql");
  const down = read("db/migrations/0081_app_releases_rollback.sql");
  assert.match(up, /^begin;/m);
  assert.match(up, /^commit;/m);
  assert.match(up, /create table if not exists app_releases/);
  assert.match(up, /version text not null unique/);
  assert.match(up, /download_url ~ '\^https:\/\/'/);
  assert.match(up, /sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(up, /enable row level security/);
  assert.match(down, /drop table if exists app_releases/);
  assert.match(read("db/schema.sql"), /create table app_releases/);
});

test("halaman admin menampilkan peringatan host eksternal + Get-FileHash", () => {
  const src = read("src/app/(admin)/admin/apps/page.tsx");
  assert.match(src, /di luar SNAPY OS/);
  assert.match(src, /tidak diverifikasi sistem/);
  assert.match(src, /Get-FileHash/);
  assert.match(src, /rel="noopener noreferrer"/);
});

test("sidebar admin memuat Katalog Aplikasi di grup Konten & Sistem", () => {
  const src = read("src/components/admin/nav.ts");
  const group = src.slice(src.indexOf('label: "Konten & Sistem"'));
  assert.match(group.slice(0, 600), /label: "Katalog Aplikasi", href: "\/admin\/apps"/);
});
