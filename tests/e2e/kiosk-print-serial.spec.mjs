/**
 * PRINT SPP — halaman uji dashboard lewat Web Serial (mock port).
 *
 * Memakai UI produksi: buka Kamera & Cetak → pilih "Foto nyata" → tombol
 * "Printer Classic (SPP)". Byte yang ditangkap port diperiksa sebagai job
 * ESC/POS: init, header raster, lebar 384/576 dot, dan perintah cut.
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import { createAdmin, resolvePhotobox, setPrintSettings } from "./helpers/booth.mjs";
import { launchKiosk } from "./helpers/browser.mjs";
import { installSerialMock, readSerialBytes, resetSerialBytes } from "./helpers/serial-mock.mjs";
import { createReporter } from "./helpers/report.mjs";
import { acquirePrintLock } from "./helpers/print-lock.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-print-serial");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);
const { photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);
const previous = photobox.print_settings ?? {};

// Lock dipegang sampai browser selesai membaca halaman, bukan hanya saat
// update DB. Tanpa ini spec Bluetooth bisa mengganti 58 → 80 di tengah tes.
const releasePrintLock = await acquirePrintLock();
try {
  await setPrintSettings(sb, photobox.id, {
    mode: "bluetooth",
    bluetooth_paper_width_mm: 58,
    auto_print: false,
  });
} catch (error) {
  await releasePrintLock();
  throw error;
}

const { context } = await launchKiosk({ headed: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 300));
});
page.on("pageerror", (error) => errors.push(error.message.slice(0, 300)));
await installSerialMock(page);

function readRasterJobs(bytes) {
  const jobs = [];
  for (let i = 0; i < bytes.length - 8; i++) {
    if (bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
      const widthBytes = bytes[i + 4] + (bytes[i + 5] << 8);
      const height = bytes[i + 6] + (bytes[i + 7] << 8);
      const payloadStart = i + 8;
      const payloadEnd = payloadStart + widthBytes * height;
      jobs.push({ offset: i, widthBytes, height, payload: bytes.slice(payloadStart, payloadEnd) });
      i = payloadEnd - 1;
    }
  }
  return jobs;
}

try {
  const session = JSON.parse(
    await import("node:fs").then(({ readFileSync }) =>
      readFileSync(".audit/browser/session-owner.json", "utf8")
    )
  );
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: session.token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "snapyos_active_business",
      value: photobox.business_id,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    },
  ]);

  await page.goto(`${cfg.base}/dashboard/photoboxes/${photobox.id}/camera`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: /test printer/i }).waitFor({ timeout: 20_000 });
  report.record("panel test printer tampil", true);

  await page.getByLabel(/Foto nyata/i).check();
  report.record("opsi foto nyata bisa dipilih", await page.getByLabel(/Foto nyata/i).isChecked());

  await resetSerialBytes(page);
  await page.getByRole("button", { name: /Printer Classic \(SPP\)/i }).click();
  await page
    .getByText(/Perintah cetak terkirim/i)
    .first()
    .waitFor({ timeout: 20_000 });

  const bytes = await readSerialBytes(page);
  report.record("job serial terkirim", bytes.length > 1000, `bytes=${bytes.length}`);
  report.record(
    "job diawali ESC @ dan diakhiri cut parsial",
    bytes[0] === 0x1b &&
      bytes[1] === 0x40 &&
      bytes.slice(-6).join(",") === [0x1b, 0x64, 3, 0x1d, 0x56, 0x01].join(","),
    bytes.slice(-6).join(",")
  );

  const rasters = readRasterJobs(bytes);
  report.record("job memuat raster foto", rasters.length > 0, `chunks=${rasters.length}`);
  if (rasters.length > 0) {
    const widthBytes = rasters[0].widthBytes;
    const totalHeight = rasters.reduce((sum, job) => sum + job.height, 0);
    const payload = rasters.flatMap((job) => job.payload);
    report.record(
      "lebar raster sesuai kertas 58mm (384 dot)",
      rasters.every((job) => job.widthBytes === widthBytes) && widthBytes * 8 === 384,
      `widthBytes=${widthBytes}`
    );
    report.record(
      "tinggi raster wajar (bukan kosong/gepeng)",
      totalHeight >= 150 && totalHeight <= 1152,
      `height=${totalHeight}`
    );
    const blackBytes = payload.filter((value) => value !== 0).length;
    const ratio = blackBytes / Math.max(1, payload.length);
    report.record(
      "foto tidak kosong dan tidak hitam penuh",
      ratio > 0.02 && ratio < 0.95,
      `ratio=${ratio.toFixed(3)}`
    );
  }

  const alerts = (await page.locator("[role=alert]").allTextContents())
    .map((text) => text.trim())
    .filter(Boolean);
  report.record("tidak ada alert error", alerts.length === 0, alerts.join(" | ").slice(0, 300));
  report.record("tanpa console/page error", errors.length === 0, errors.join(" | ").slice(0, 300));
} catch (error) {
  report.record("alur cetak SPP berjalan", false, error.message);
} finally {
  await context.close();
  await sb.from("photoboxes").update({ print_settings: previous }).eq("id", photobox.id);
  await releasePrintLock();
  report.finish();
}
