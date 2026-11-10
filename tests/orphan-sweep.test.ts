/**
 * Cron orphan sweep — objek `generated-photos` yang tidak direferensikan
 * `sessions.result_gif_key` / `photos.file_key` dan umurnya > 24 jam.
 *
 * Bukti utama yang diuji:
 *  - objek yang MASIH direferensikan TIDAK PERNAH masuk kandidat hapus;
 *  - objek muda (< 24 jam) tidak tersapu (upload yang sedang berjalan aman);
 *  - batas per run dipatuhi (biaya terkendali) dan urutannya deterministik;
 *  - route benar-benar memakai kedua kolom referensi + menghapus sebelum
 *    akuntansi (static source check, karena route menyentuh R2/Supabase).
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  businessIdFromKey,
  groupKeysByBusiness,
  selectOrphans,
  type SweepObject,
} from "../src/lib/orphan-sweep.ts";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MIN_AGE = DAY;

function obj(key: string, ageMs: number, bytes = 1000): SweepObject {
  return { key, bytes, lastModifiedMs: NOW - ageMs };
}

test("sweep: objek yang direferensikan DB tidak pernah jadi kandidat hapus", () => {
  const referenced = new Set(["biz-1/sessions/s1/photo-00.jpg"]);
  const objects = [
    obj("biz-1/sessions/s1/photo-00.jpg", 3 * DAY),
    obj("biz-1/sessions/s1/photo-01.jpg", 3 * DAY),
  ];
  const { orphans, skippedReferenced } = selectOrphans(objects, referenced, NOW, MIN_AGE, 100);

  assert.deepEqual(
    orphans.map((o) => o.key),
    ["biz-1/sessions/s1/photo-01.jpg"]
  );
  assert.equal(skippedReferenced, 1);
});

test("sweep: GIF yang masih dirujuk sessions.result_gif_key dipertahankan", () => {
  const referenced = new Set(["biz-1/sessions/s9/result.gif"]);
  const { orphans } = selectOrphans(
    [obj("biz-1/sessions/s9/result.gif", 10 * DAY)],
    referenced,
    NOW,
    MIN_AGE,
    100
  );
  assert.equal(orphans.length, 0);
});

test("sweep: objek < 24 jam dilewati walau tidak direferensikan", () => {
  const objects = [
    obj("biz-1/sessions/live/photo-00.jpg", HOUR),
    obj("biz-1/sessions/live/photo-01.jpg", 23 * HOUR),
    obj("biz-1/sessions/live/photo-02.jpg", 25 * HOUR),
  ];
  const { orphans, skippedYoung } = selectOrphans(objects, new Set(), NOW, MIN_AGE, 100);

  assert.deepEqual(
    orphans.map((o) => o.key),
    ["biz-1/sessions/live/photo-02.jpg"]
  );
  assert.equal(skippedYoung, 2);
});

test("sweep: lastModified tidak valid dianggap belum tua (fail-safe, tidak dihapus)", () => {
  const objects: SweepObject[] = [
    { key: "biz-1/rusak.jpg", bytes: 10, lastModifiedMs: Number.NaN },
  ];
  const { orphans, skippedYoung } = selectOrphans(objects, new Set(), NOW, MIN_AGE, 100);
  assert.equal(orphans.length, 0);
  assert.equal(skippedYoung, 1);
});

test("sweep: batas per run dipatuhi, terlama dulu (backlog tersalirkan)", () => {
  const objects = [
    obj("biz-1/baru.jpg", 2 * DAY),
    obj("biz-1/lama.jpg", 30 * DAY),
    obj("biz-1/tengah.jpg", 5 * DAY),
  ];
  const { orphans } = selectOrphans(objects, new Set(), NOW, MIN_AGE, 2);
  assert.deepEqual(
    orphans.map((o) => o.key),
    ["biz-1/lama.jpg", "biz-1/tengah.jpg"]
  );
});

test("sweep: limit 0 / negatif tidak menghapus apa pun", () => {
  const objects = [obj("biz-1/x.jpg", 30 * DAY)];
  assert.equal(selectOrphans(objects, new Set(), NOW, MIN_AGE, 0).orphans.length, 0);
  assert.equal(selectOrphans(objects, new Set(), NOW, MIN_AGE, -5).orphans.length, 0);
});

test("sweep: key kosong diabaikan", () => {
  const { orphans } = selectOrphans(
    [{ key: "", bytes: 1, lastModifiedMs: NOW - 5 * DAY }],
    new Set(),
    NOW,
    MIN_AGE,
    10
  );
  assert.equal(orphans.length, 0);
});

test("grouping: key dikelompokkan per businessId untuk akuntansi per tenant", () => {
  const groups = groupKeysByBusiness([
    "biz-1/sessions/a/photo-00.jpg",
    "biz-2/sessions/b/photo-00.jpg",
    "biz-1/sessions/a/result.gif",
  ]);
  assert.deepEqual(groups.get("biz-1")?.length, 2);
  assert.deepEqual(groups.get("biz-2")?.length, 1);
  assert.equal(businessIdFromKey("biz-1/sessions/a/photo-00.jpg"), "biz-1");
  assert.equal(businessIdFromKey("tanpa-slash"), "tanpa-slash");
});

test("route sweep: memakai kedua kolom referensi + hapus dulu baru akuntansi", async () => {
  const src = await readFile(
    new URL("../src/app/api/cron/orphan-sweep/route.ts", import.meta.url),
    "utf8"
  );
  // Referensi WAJIB dari kedua sumber; salah satu hilang = foto/GIF aktif terhapus.
  assert.match(src, /from\("photos"\)[\s\S]*?select\("file_key"\)/);
  assert.match(src, /from\("sessions"\)[\s\S]*?select\("result_gif_key"\)/);
  assert.match(src, /in\("file_key", chunk\)/);
  assert.match(src, /in\("result_gif_key", chunk\)/);
  // Referensi gagal dimuat → sweep dibatalkan (tidak menebak lalu menghapus).
  assert.match(src, /sweep dibatalkan/);
  // Umur minimum 24 jam + pemilihan lewat modul pure yang teruji.
  assert.match(src, /MIN_AGE_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(src, /selectOrphans\(scanned, referenced/);
  // dry_run lewat query param DAN env.
  assert.match(src, /dry_run/);
  assert.match(src, /ORPHAN_SWEEP_DRY_RUN/);
  // Akuntansi setelah hapus sukses (bukan sebelumnya).
  const removeAt = src.indexOf("provider.remove(");
  const accountAt = src.indexOf("accountStorageSub(", removeAt);
  assert.ok(removeAt > 0, "route harus memanggil provider.remove");
  assert.ok(accountAt > removeAt, "account_sub hanya setelah delete sukses");
  // Batas per run.
  assert.match(src, /MAX_SCAN_PER_RUN/);
  assert.match(src, /MAX_DELETE_PER_RUN/);
});

test("selectOrphans keeps the caller's provider field (per-provider delete path)", () => {
  type Candidate = SweepObject & { provider: string };
  const objects: Candidate[] = [
    { key: "biz-1/sessions/s1/a.jpg", bytes: 1, lastModifiedMs: NOW - 3 * DAY, provider: "r2" },
    { key: "biz-1/sessions/s1/b.jpg", bytes: 1, lastModifiedMs: NOW - 2 * DAY, provider: "s3" },
  ];
  const selection = selectOrphans(objects, new Set(), NOW, MIN_AGE, 10);
  // Provider ikut terbawa sehingga route bisa mengelompokkan per backend hapus.
  assert.deepEqual(
    selection.orphans.map((o) => o.provider),
    ["r2", "s3"]
  );
});
