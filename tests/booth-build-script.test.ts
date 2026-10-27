/**
 * Build booth Windows (`scripts/build-booth.ps1`).
 *
 * Skrip tidak bisa dijalankan di macOS, jadi yang dikunci di sini adalah janji
 * yang tetap bisa diperiksa dari teksnya: sidecar diberi nama sesuai target
 * triple Tauri, SHA-256 node.exe dicocokkan dengan SHASUMS256.txt resmi, modul
 * native Windows ikut diverifikasi, dan versi runtime tidak pernah tertinggal
 * sebagai 0.0.0.
 *
 * Dual-runner: `npm test` memakai node:test, sedangkan file ini juga harus bisa
 * dijalankan dengan `npx vitest run`. Assertion memakai node:assert agar sama
 * di kedua runner.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// `node:test` dan `vitest` punya signature `test` yang berbeda; yang dipakai
// di sini hanya bentuk paling dasar.
type TestFn = (name: string, fn: () => void) => unknown;
const test: TestFn = (
  process.env.VITEST ? (await import("vitest")).test : (await import("node:test")).test
) as TestFn;
const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const build = read("scripts/build-booth.ps1");
/** Baris perintah (bukan komentar) di skrip. */
const codeLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("<#"));

test("build: sidecar diberi nama target triple Tauri", () => {
  // Tauri mencari `node-<triple>.exe`; nama lain berarti sidecar tidak pernah
  // dipakai dan runtime lokal tidak ikut ke installer.
  assert.match(build, /node-x86_64-pc-windows-msvc\.exe/);
  const sidecarLines = codeLines(build).filter((line) => /\$SidecarPath\s*=/.test(line));
  assert.equal(sidecarLines.length, 1, "path sidecar harus didefinisikan sekali");
});

test("build: SHA-256 node.exe dicocokkan dengan SHASUMS256.txt resmi", () => {
  // Tanpa verifikasi, node.exe yang rusak atau diganti di tengah unduhan ikut
  // masuk ke installer dan runtime booth menjalankan binary tak dikenal.
  assert.match(build, /Get-FileHash -LiteralPath \$tmp -Algorithm SHA256/);
  assert.match(build, /SHASUMS256\.txt/);
  // `\.` dan `$` adalah escape regex PowerShell, bukan JS.
  assert.match(build, /win-x64\/node\\\.exe\$"/);
  assert.match(build, /SHA-256 node\.exe tidak cocok/);
  // Unduhan sementara tidak boleh tertinggal di %TEMP%.
  assert.match(build, /Remove-Item -LiteralPath \$tmp -Force/);
});

test("build: memeriksa toolchain MSVC, WiX, dan NSIS", () => {
  assert.match(build, /stable-x86_64-pc-windows-msvc/);
  assert.match(build, /candle\.exe/); // WiX, untuk target msi
  assert.match(build, /makensis\.exe/); // NSIS, untuk target nsis
  assert.match(build, /AMD64/); // argon2 hanya tersedia x64
});

test("build: memverifikasi modul native Windows dan font PDF ikut terbundel", () => {
  // Bundler menyalin paket sesuai platform mesin build. Di Mac hasilnya
  // darwin-arm64, jadi build Windows wajib memastikan paket win32 ada.
  assert.match(build, /argon2-win32-x64-msvc/);
  assert.match(build, /standard-fonts/);
  assert.match(build, /Cetak PDF akan gagal/);
});

test("build: versi runtime ditulis dan dicocokkan dengan tauri.conf.json", () => {
  // `runtime/version.ts` membaca package.json di sebelah main.mjs. Bundel tidak
  // membuat berkas itu, jadi tanpa langkah ini runtime melaporkan 0.0.0 dan
  // dashboard owner tidak pernah menandai booth ketinggalan.
  assert.match(build, /runtime-dist\\package\.json/);
  assert.match(build, /tauri\.conf\.json/);
  assert.match(build, /Versi tidak sinkron/);
  assert.match(build, /Add-Member -NotePropertyName version/);
});

test("build: versi default sama dengan versi aplikasi", () => {
  const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
  const app = JSON.parse(read("package.json"));
  const declared = /\[string\]\$NodeVersion = "([^"]+)"/.exec(build)?.[1];
  assert.ok(declared, "versi Node sidecar harus punya nilai default eksplisit");
  // Node 22 awal masih butuh --experimental-sqlite; installer menolaknya.
  assert.ok(Number(declared.split(".")[0]) >= 24, "sidecar harus Node >= 24");
  assert.equal(
    tauri.version,
    app.version,
    "tauri.conf.json dan package.json harus ber-versi sama sebelum build"
  );
});

test("build: tidak ada rahasia yang tertanam di skrip", () => {
  // Token/hex/base64 >= 32 karakter di dalam tanda kutip = kunci yang ikut
  // tersebar ke setiap mesin build.
  const quoted = [...build.matchAll(/"([A-Za-z0-9+/=_-]{32,})"/g)].map((m) => m[1]);
  assert.deepEqual(quoted, []);
});

test("build: artefak dikemas jadi satu ZIP untuk diinstal manual", () => {
  // Owner/operator tidak boleh perlu tahu bedanya msi dan nsis: satu berkas
  // yang bisa diekstrak lalu dipasang. Compress-Archive bawaan PowerShell,
  // tidak ada dependensi baru.
  assert.match(build, /Compress-Archive -Path \$DistDir -DestinationPath \$zipFile/);
  assert.match(build, /snapyos-booth-build\.zip/);
  // ZIP lama dari build sebelumnya harus dihapus dulu, kalau tidak isinya
  // tercampur dengan artefak yang sudah tidak ada.
  assert.match(build, /Remove-Item -LiteralPath \$zipFile -Force/);
  // ZIP dibuat setelah artefak dipastikan ada, bukan sebelum.
  const compressAt = build.indexOf("Compress-Archive");
  const artifactCheckAt = build.indexOf("tidak ada artefak di");
  assert.ok(compressAt > artifactCheckAt, "ZIP dibuat setelah artefak dipastikan ada");
});

test("build: kegagalan selalu keluar dengan exit code non-nol", () => {
  // Build yang gagal tapi exit 0 akan dianggap sukses oleh CI dan operator.
  for (const line of codeLines(build)) {
    assert.doesNotMatch(line, /\bexit\s+0\b/, `baris ini menelan kegagalan: ${line}`);
  }
  assert.ok(
    codeLines(build).some((line) => /^exit 1$/.test(line)),
    "Fail harus exit 1"
  );
});
