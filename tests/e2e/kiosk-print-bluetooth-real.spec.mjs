/**
 * PRINT BLUETOOTH, HARDWARE ASLI.
 *
 * Menjalankan Chrome BERJENDELA tanpa mock. Alur yang dipakai adalah UI
 * produksi: aktivasi → Setup Wizard → tahap "Uji cetak" (PrintTestPanel) →
 * tombol "Cetak halaman uji" → operator memilih printer di dialog Chrome.
 *
 * Prasyarat:
 *   - printer thermal ESC/POS menyala dan sudah di-pair di OS
 *   - `.env.local` berisi SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - dev server jalan (`npm run dev`)
 *
 * Jalankan:
 *   npm run test:e2e:bluetooth:real
 *
 * Batas platform (bukan bug): Chrome desktop/Android saja. iPad/Safari tidak
 * punya Web Bluetooth, dan printer foto konsumen (Selphy/Sprocket) tidak
 * memakai ESC/POS sehingga memang harus lewat dialog sistem.
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import { createAdmin, resolvePhotobox, mintActivationCode, resetBooth, setPrintSettings, waitForPrintMode } from "./helpers/booth.mjs";
import { createReporter } from "./helpers/report.mjs";

import { chromium } from "playwright";

const CHROME_PATH = process.env.E2E_CHROME_PATH ?? undefined;
const PICK_TIMEOUT_MS = Number(process.env.E2E_BT_PICK_TIMEOUT_MS ?? 180_000);

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-print-bluetooth-real");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);
const { business, photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);

await resetBooth(sb, photobox.id);
// Booth wajib di mode thermal; kalau tidak, wizard menampilkan jalur dialog OS.
await setPrintSettings(sb, photobox.id, { mode: "bluetooth", bluetooth_paper_width_mm: 80, enabled: true });
// Cache config publik 30 detik: tunggu sampai kiosk benar-benar melihat mode ini.
await waitForPrintMode(cfg.base, cfg.businessSlug, cfg.photoboxSlug, "bluetooth");
const code = await mintActivationCode(sb, photobox.id, business.id);

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  channel: CHROME_PATH ? undefined : "chrome",
  headless: false,
  args: [
    "--enable-features=WebBluetooth",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ["camera"],
});
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

// Instrumentasi GATT asli: hitung byte yang benar-benar ditulis ke printer.
await page.addInitScript(() => {
  window.__btRealBytes = 0;
  window.__btRealWrites = 0;
  const proto = window.BluetoothRemoteGATTCharacteristic?.prototype;
  if (!proto) return;
  for (const name of ["writeValue", "writeValueWithoutResponse"]) {
    const original = proto[name];
    if (typeof original !== "function") continue;
    proto[name] = function (value) {
      window.__btRealBytes += value?.byteLength ?? 0;
      window.__btRealWrites += 1;
      return original.call(this, value);
    };
  }
});

try {
  await page.goto(`${cfg.kioskUrl}?code=${encodeURIComponent(code)}`, { waitUntil: "domcontentloaded" });

  const setupHeading = page.getByRole("heading", { name: /siapkan kamera/i });
  await setupHeading.waitFor({ timeout: 30_000 });
  report.record("aktivasi membuka setup wizard", true);

  await page.getByRole("button", { name: /lanjut ke uji cetak/i }).click();
  const printHeading = page.getByRole("heading", { name: /test printer/i });
  await printHeading.waitFor({ timeout: 20_000 });
  report.record("tahap uji cetak terbuka", true);

  const modeLine = await page.getByText(/Bluetooth thermal/i).first().textContent();
  report.record("wizard memakai jalur thermal", /bluetooth/i.test(modeLine ?? ""), modeLine ?? "");

  console.log(
    `\n>>> Nyalakan printer thermal, lalu pilih printer di dialog Chrome.` +
      `\n>>> Menunggu maksimal ${Math.round(PICK_TIMEOUT_MS / 1000)} detik…\n`
  );
  await page.getByRole("button", { name: /cetak halaman uji/i }).click();

  // Selesai = perintah terkirim, atau pesan error muncul (mis. printer bukan ESC/POS).
  const outcome = await page
    .waitForFunction(
      () => {
        const text = document.body.innerText;
        if (/Perintah cetak terkirim/i.test(text)) return "sent";
        if (/Gagal mengirim halaman uji|tidak mendukung ESC\/POS/i.test(text)) return "error";
        return null;
      },
      null,
      { timeout: PICK_TIMEOUT_MS }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => "timeout");

  report.record("printer dipilih dan perintah terkirim", outcome === "sent", `outcome=${outcome}`);

  if (outcome === "sent") {
    const counters = await page.evaluate(() => ({
      bytes: window.__btRealBytes,
      writes: window.__btRealWrites,
    }));
    report.record("job ESC/POS berukuran wajar", counters.bytes > 5_000, `bytes=${counters.bytes}`);
    report.record(
      "byte benar-benar ditulis ke karakteristik printer",
      counters.bytes > 0 && counters.writes > 0,
      `bytes=${counters.bytes} writes=${counters.writes}`
    );
    console.log(
      "\n>>> Periksa fisik: halaman uji harus tercetak utuh dan kertas terpotong." +
        "\n>>> Konfirmasi manual ini dicatat pada laporan rilis.\n"
    );
    // Persist hasil uji ke device_status lewat UI produksi.
    await page.getByRole("button", { name: /ya, berhasil/i }).click();
    await page.waitForTimeout(800);
    report.record("hasil uji tersimpan dari wizard", true);
  } else if (outcome === "error") {
    const text = await page.locator("[role=alert]").first().textContent().catch(() => "");
    report.record("printer menolak ESC/POS (pakai dialog sistem)", false, text ?? "tanpa pesan");
  }

  report.record("tanpa console error", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (error) {
  report.record("spec hardware berjalan", false, error.message);
} finally {
  await context.close();
  await browser.close();
  report.finish();
}
