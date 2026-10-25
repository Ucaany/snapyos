/**
 * Phase 10 — installer Windows.
 *
 * Skrip PowerShell tidak bisa dijalankan di macOS, jadi yang diuji di sini
 * adalah janji yang tetap bisa diperiksa dari teks skripnya: tidak ada token
 * literal yang ikut terkirim ke semua booth, dan uninstaller tidak pernah
 * menyentuh data booth.
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

const install = read("scripts/install-snapyos.ps1");
const uninstall = read("scripts/uninstall-snapyos.ps1");

/** Baris perintah (bukan komentar) di skrip. */
const codeLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("<#"));

test("installer: token bridge tidak pernah ditulis literal di skrip", () => {
  const tokenLines = codeLines(install).filter((line) => /PHOTOBOOTH_BRIDGE_TOKEN\s*=/.test(line));

  assert.equal(tokenLines.length, 1, "harus ada tepat satu baris token di bridge.env");
  // Satu-satunya nilai yang boleh: hasil variabel yang dibuat saat instalasi.
  assert.match(tokenLines[0]!, /PHOTOBOOTH_BRIDGE_TOKEN=\$bridgeToken/);

  // Token dibuat di mesin booth, bukan dibekukan ke dalam skrip.
  assert.match(install, /RandomNumberGenerator/);
  assert.match(install, /\$bridgeToken\s*=\s*\[Convert\]::ToBase64String/);
});

test("installer: tidak ada token device literal", () => {
  const deviceTokenLines = codeLines(install).filter((line) =>
    /SNAPYOS_DEVICE_TOKEN\s*=/.test(line)
  );
  assert.deepEqual(
    deviceTokenLines,
    [],
    "token device diisi setelah aktivasi booth, bukan saat instalasi"
  );
});

test("installer: tidak ada nilai rahasia panjang yang tertanam", () => {
  // Token/hex/base64 ≥ 32 karakter di dalam tanda kutip = kunci yang ikut
  // tersebar ke semua booth. GUID dan SID Windows lebih pendek dari ini.
  const quoted = [...install.matchAll(/"([A-Za-z0-9+/=_-]{32,})"/g)].map((m) => m[1]);
  assert.deepEqual(quoted, []);
});

test("installer: memeriksa Node >= 22 dan WebView2", () => {
  assert.match(install, /nodeMajor -lt 22/);
  assert.match(install, /node:sqlite/);
  assert.match(install, /\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5\}/);
});

test("installer: bridge.env diberi ACL SYSTEM + Administrators saja", () => {
  // Satu-satunya pemanggilan icacls untuk bridge.env.
  const call = /Invoke-Native "icacls\.exe" @\(\s*\$EnvFile,([\s\S]*?)\)\s*\n/.exec(install);
  assert.ok(call, "icacls untuk bridge.env harus ada");

  const args = call[1]!;
  // Tanpa inheritance:r, izin warisan folder induk ikut masuk.
  assert.match(args, /\/inheritance:r/);
  assert.match(args, /\*S-1-5-18:\(F\)/); // SYSTEM
  assert.match(args, /\*S-1-5-32-544:\(F\)/); // Administrators
  // Users tidak boleh bisa membaca token bridge.
  assert.doesNotMatch(args, /S-1-5-32-545/);
});

test("installer: tugas boot berjalan sebagai SYSTEM", () => {
  assert.match(install, /\$TaskName\s*=\s*"SnapyOSRuntime"/);
  assert.match(install, /<BootTrigger>/);
  assert.match(install, /<UserId>S-1-5-18<\/UserId>/);

  const call = /Invoke-Native "schtasks\.exe" @\(([^)]*)\)/.exec(install);
  assert.ok(call, "schtasks /create harus ada");
  const args = call[1]!;
  for (const arg of ['"/create"', '"/tn"', "$TaskName", '"/xml"', "$TaskXml"]) {
    assert.ok(args.includes(arg), `schtasks kehilangan argumen ${arg}`);
  }
});

test("installer: PIN darurat diminta, di-hash, tidak disimpan mentah", () => {
  assert.match(install, /Read-Host "  PIN darurat \(4-8 digit\)" -AsSecureString/);
  assert.match(install, /\^\\d\{4,8\}\$/);
  assert.match(install, /exit_pin_emergency_hash/);
  assert.match(install, /algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1/);
});

test("installer: parameter argon2 sama dengan hashDevicePin di kode", () => {
  const source = read("src/lib/device-token.ts");
  const memory = /memoryCost:\s*([\d_]+)/.exec(source)?.[1];
  const time = /timeCost:\s*(\d+)/.exec(source)?.[1];
  const parallelism = /parallelism:\s*(\d+)/.exec(source)?.[1];

  assert.equal(memory, "19_456");
  assert.match(install, new RegExp(`memoryCost: ${memory!.replace("_", "")}`));
  assert.match(install, new RegExp(`timeCost: ${time}`));
  assert.match(install, new RegExp(`parallelism: ${parallelism}`));
});

test("installer: mendeteksi digiCamControl dan SumatraPDF", () => {
  assert.match(install, /digiCamControl\\CameraControlCmd\.exe/);
  assert.match(install, /SumatraPDF\.exe/);
});

test("installer: slug booth dari KioskUrl masuk ke meta store", () => {
  // Tanpa slug, POST /v1/sessions menjawab 409 dan booth tidak bisa jualan
  // offline sama sekali — jadi ini bukan kenyamanan, melainkan prasyarat.
  assert.match(install, /"\^\/p\/\(\[\^\/\]\+\)\/\(\[\^\/\?#\]\+\)"/);
  assert.match(install, /put\.run\("business_slug", businessSlug\)/);
  assert.match(install, /put\.run\("photobox_slug", photoboxSlug\)/);
  // Slug kosong tidak boleh menimpa slug yang sudah benar.
  assert.match(install, /if \(businessSlug\) put\.run/);
});

test("installer: origin kiosk ikut diizinkan runtime", () => {
  // Runtime menolak request dari origin di luar PHOTOBOOTH_BRIDGE_ORIGINS, dan
  // request kiosk datang dari origin KioskUrl — bukan selalu dari CloudUrl.
  assert.match(install, /PHOTOBOOTH_BRIDGE_ORIGINS=\$origin/);
  assert.match(
    install,
    /if \(\$origins -notcontains \$kioskOrigin\) \{ \$origins \+= \$kioskOrigin \}/
  );
});

test("uninstall: hanya menghapus tugas dan bridge.env", () => {
  const removals = codeLines(uninstall).filter((line) => /^Remove-Item/.test(line));

  assert.ok(removals.length > 0);
  for (const line of removals) {
    assert.match(
      line,
      /Remove-Item -LiteralPath \$(EnvFile|TaskXml) /,
      `Remove-Item tak terduga: ${line}`
    );
    // Data booth bisa besar; hapus rekursif di sini = kehilangan sesi pelanggan.
    assert.doesNotMatch(line, /-Recurse/);
  }
});

test("uninstall: data dir tidak pernah dihapus", () => {
  // Data dir hanya dibaca dari bridge.env untuk dicetak ke operator.
  assert.match(uninstall, /SNAPYOS_DATA_DIR/);
  assert.match(uninstall, /\$dataDir = \(\$dataLine\.Line -split "=", 2\)\[1\]\.Trim\(\)/);
  assert.match(uninstall, /Data booth TIDAK dihapus/);

  // Tidak ada Remove-Item/rmdir/del yang menyebut data dir sama sekali.
  const destructive = codeLines(uninstall).filter((line) =>
    /(Remove-Item|Remove-ItemProperty|rmdir|del |rd )/.test(line)
  );
  for (const line of destructive) {
    assert.doesNotMatch(line, /\$dataDir|snapyos\.db|media|quarantine/i, `menyentuh data: ${line}`);
  }
});
