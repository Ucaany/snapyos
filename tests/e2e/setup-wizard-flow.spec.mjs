/**
 * K2 — Setup Wizard end-to-end (kamera + print).
 *
 * Memerlukan booth + activation code aktif di Supabase. Default di-skip —
 * untuk menjalankan end-to-end sebenarnya:
 *
 *   1. Isi .env.local (Supabase + booth + activation code)
 *   2. npm run dev   # di terminal lain
 *   3. E2E_K2=1 \
 *      E2E_BUSINESS_SLUG=<slug> \
 *      E2E_PHOTOBOX_SLUG=<slug> \
 *      E2E_ACTIVATION_CODE=<6 digit> \
 *      node tests/e2e/setup-wizard-flow.spec.mjs
 *
 * Browser: Chromium **headed** dengan --use-fake-ui-for-media-stream dan
 * --use-fake-device-for-media-stream agar permission kamera otomatis disetujui
 * (tetap memakai mediaDevices.getUserMedia + enumerateDevices yang dipakai
 * SetupWizard). Frame YUV di Chromium macOS tidak berisi gambar tanpa file
 * sumber — pengujian live mengecek `track.readyState==='live'` (gate
 * "Lanjut" di SetupWizard), bukan konten piksel.
 *
 * Untuk kamera fisik nyata, hapus flag fake-device di launch options dan
 * klik "Allow" pada dialog izin OS.
 */

import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const ENABLED = process.env.E2E_K2 === "1";
const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const BUSINESS = process.env.E2E_BUSINESS_SLUG ?? "";
const PHOTOBOX = process.env.E2E_PHOTOBOX_SLUG ?? "";
const CODE = process.env.E2E_ACTIVATION_CODE ?? "";
const PHOTOBOX_LS_KEY = `snapyos_device_setup_done:${PHOTOBOX}`;

if (!ENABLED) {
  console.log("SKIP: set E2E_K2=1 + booth env untuk menjalankan (lihat header file).");
  process.exit(0);
}

if (!BUSINESS || !PHOTOBOX || !CODE) {
  console.error("FAIL: E2E_BUSINESS_SLUG, E2E_PHOTOBOX_SLUG, E2E_ACTIVATION_CODE wajib diisi");
  process.exit(1);
}

const KIOSK_URL = `${BASE}/p/${BUSINESS}/${PHOTOBOX}?code=${CODE}`;

const browser = await chromium.launch({
  headless: false,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.grantPermissions(["camera"], { origin: BASE });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/i.test(m.text())) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});

await page.goto(KIOSK_URL, { waitUntil: "domcontentloaded" });

// 1) Aktivasi (initial code auto-submit) → masuk step "setup"
await page.waitForSelector("text=Siapkan kamera", { timeout: 15000 });
console.log("step 1: kamera");

// 2) Stream live
await page.waitForFunction(() => {
  const v = document.querySelector("video");
  return v && v.srcObject && v.srcObject.getVideoTracks().some((t) => t.readyState === "live");
}, null, { timeout: 10000 });
const camState = await page.evaluate(() => {
  const v = document.querySelector("video");
  const t = v.srcObject.getVideoTracks()[0];
  return { label: t.label, w: t.getSettings().width, readyState: t.readyState };
});
console.log("kamera:", camState);
assert.equal(camState.readyState, "live", "track harus live");

// 3) Lanjut ke print
await page.click("text=Lanjut ke uji cetak");
await page.waitForSelector("text=Uji cetak", { timeout: 5000 });
console.log("step 2: print");

// 4) Intercept window.print() agar tidak membuka dialog OS, lalu trigger afterprint
await page.evaluate(() => {
  // @ts-expect-error override untuk E2E
  window.print = function () {
    setTimeout(() => window.dispatchEvent(new Event("afterprint")), 50);
  };
});

// 5) Lewati uji cetak (jalur skip yang baru)
await page.click("text=Lewati uji cetak");
await page.waitForFunction(
  (k) => localStorage.getItem(k) === "1",
  PHOTOBOX_LS_KEY,
  { timeout: 5000 }
);
const key = await page.evaluate((k) => localStorage.getItem(k), PHOTOBOX_LS_KEY);
console.log("SETUP_KEY:", key);
assert.equal(key, "1", "SETUP_KEY per slug harus tertulis");

// 6) Welcome muncul
await page.waitForSelector("text=Selamat datang", { timeout: 5000 });
console.log("step 3: welcome");

assert.deepEqual(consoleErrors, [], "tidak boleh ada console error");

await browser.close();
console.log("K2 E2E PASS");
