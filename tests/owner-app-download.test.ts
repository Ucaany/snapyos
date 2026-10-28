/**
 * Phase 12 — unduh aplikasi booth di dashboard owner (`/dashboard/apps`).
 *
 * Yang dikunci: rilis nonaktif tidak muncul, tautan keluar memakai
 * `rel="noopener noreferrer"` (bukan `download`, yang diabaikan lintas origin),
 * sha256 kosong tidak dirender, booth tanpa laporan jujur "Belum pernah
 * dilaporkan", dan versi lebih rendah dapat badge perlu update.
 *
 * Dual-runner: `npm test` memakai node:test, file ini juga jalan di
 * `npx vitest run`. Assertion memakai node:assert agar sama di kedua runner.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compareAppVersions, needsAppUpdate } from "../src/lib/app-release.ts";
import { deviceReportSchema } from "../src/lib/validators.ts";

type TestFn = (name: string, fn: () => void) => unknown;
const test: TestFn = (
  process.env.VITEST ? (await import("vitest")).test : (await import("node:test")).test
) as TestFn;

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PAGE = "src/app/(dashboard)/dashboard/apps/page.tsx";
const CARD = "src/components/dashboard/AppDownloadCard.tsx";

// ---------------------------------------------------------------------------
// Rilis nonaktif tidak muncul
// ---------------------------------------------------------------------------
test("listOwnerReleases hanya mengambil rilis aktif", () => {
  const src = read("src/server/app-releases.ts");
  assert.match(src, /\.eq\("is_active", true\)/, "query owner wajib memfilter is_active");
});

test("halaman owner memakai listOwnerReleases, bukan query admin", () => {
  const src = read(PAGE);
  assert.match(src, /listOwnerReleases\(\)/);
  assert.doesNotMatch(src, /from\("@\/server\/admin"\)/, "halaman owner tidak boleh impor admin");
});

// ---------------------------------------------------------------------------
// Link keluar
// ---------------------------------------------------------------------------
test("link unduhan memakai target blank + rel noopener noreferrer", () => {
  for (const file of [PAGE, CARD]) {
    const src = read(file);
    const anchors = src.match(/<a\s[\s\S]*?<\/a>/g) ?? [];
    assert.ok(anchors.length > 0, `${file} harus punya tautan`);
    for (const anchor of anchors) {
      assert.match(anchor, /target="_blank"/, `${file}: setiap tautan keluar buka tab baru`);
      assert.match(
        anchor,
        /rel="noopener noreferrer"/,
        `${file}: setiap tautan keluar wajib rel="noopener noreferrer"`
      );
    }
  }
});

test("tidak memakai atribut download (diabaikan untuk URL lintas origin)", () => {
  for (const file of [PAGE, CARD]) {
    const anchors = read(file).match(/<a\s[\s\S]*?>/g) ?? [];
    for (const anchor of anchors) {
      assert.doesNotMatch(anchor, /\sdownload[\s=>]/, `${file}: <a> jangan pakai atribut download`);
    }
  }
});

test("host tujuan ditampilkan sebelum diklik", () => {
  assert.match(read(CARD), /hostOf\(release\.download_url\)/);
});

// ---------------------------------------------------------------------------
// sha256 opsional
// ---------------------------------------------------------------------------
test("sha256 kosong tidak dirender", () => {
  const src = read(CARD);
  assert.match(src, /\{release\.sha256 \? \(/, "blok sha256 harus di balik kondisi");
  assert.doesNotMatch(src, /sha256 \?\?/, "jangan render placeholder untuk sha256 kosong");
});

test("sha256 tampil dalam font-mono dengan tombol salin", () => {
  const src = read(CARD);
  assert.match(src, /font-mono[^"]*">\s*\{release\.sha256\}/, "hash harus blok font-mono");
  assert.match(src, /navigator\.clipboard\.writeText/, "harus ada tombol salin yang bekerja");
});

// ---------------------------------------------------------------------------
// Status versi booth
// ---------------------------------------------------------------------------
test("booth tanpa laporan -> Belum pernah dilaporkan", () => {
  assert.match(read(PAGE), /Belum pernah dilaporkan/);
});

test("versi lebih rendah -> badge perlu update", () => {
  assert.equal(needsAppUpdate("1.0.0", "1.2.0"), true);
  assert.equal(needsAppUpdate("1.2.0", "1.2.0"), false);
  assert.equal(needsAppUpdate("1.10.0", "1.9.0"), false, "bandingkan numerik, bukan string");
  assert.equal(needsAppUpdate(null, "1.2.0"), false, "tanpa laporan bukan perlu update");
  assert.equal(compareAppVersions("1.2.3", "1.2.4"), -1);
  assert.match(read(PAGE), /Perlu diperbarui/i);
});

// ---------------------------------------------------------------------------
// app_version sampai ke cloud
// ---------------------------------------------------------------------------
test("deviceReportSchema menerima app_version semver", () => {
  const base = { device_token: "a".repeat(40) };
  assert.equal(deviceReportSchema.safeParse({ ...base, app_version: "1.2.3" }).success, true);
  assert.equal(deviceReportSchema.safeParse(base).success, true, "opsional untuk booth lama");
  assert.equal(deviceReportSchema.safeParse({ ...base, app_version: "v1.2.3" }).success, false);
  assert.equal(
    deviceReportSchema.safeParse({ ...base, app_version: "1.2.3-beta.1.1234567890" }).success,
    false,
    "maks 20 karakter"
  );
});

test("reportDevice menyimpan app_version ke device_status", () => {
  const src = read("src/server/devices.ts");
  assert.match(src, /deviceStatus\.app_version = input\.app_version/);
});

test("updateDeviceSettings menyimpan app_version dari PATCH setelan", () => {
  const src = read("src/server/devices.ts");
  assert.match(src, /patch\.device_status = \{[\s\S]{0,200}app_version: input\.app_version/);
  assert.match(
    read("src/lib/validators.ts"),
    /deviceSettingsPatchSchema[\s\S]{0,300}app_version/,
    "skema PATCH wajib menerima app_version"
  );
});

test("runtime mengirim app_version saat tulis balik setelan", () => {
  const src = read("runtime/sync/worker.ts");
  assert.match(src, /app_version: VERSION/);
  assert.match(src, /from "\.\.\/version\.ts"/);
  // Versi diambil dari package.json, bukan angka yang ditulis ulang di kode.
  assert.match(read("runtime/version.ts"), /package\.json/);
});

// ---------------------------------------------------------------------------
// Batas jujur: tidak ada tombol kirim update
// ---------------------------------------------------------------------------
test("tidak ada tombol kirim update ke booth", () => {
  // Halaman server tidak punya kontrol interaktif sama sekali: satu-satunya
  // tombol di kartu adalah "salin hash" (client).
  assert.doesNotMatch(read(PAGE), /<button/, "halaman owner tidak punya tombol aksi");
  assert.doesNotMatch(read(PAGE), /onClick/);
  assert.match(read(PAGE), /Pembaruan\s+dipasang manual/);
});
