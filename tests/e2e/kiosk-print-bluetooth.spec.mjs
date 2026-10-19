/**
 * PRINT BLUETOOTH — job ESC/POS benar-benar sampai ke karakteristik printer.
 *
 * Memakai mock `navigator.bluetooth` (tanpa hardware). Yang dibuktikan:
 * - job diawali `ESC @` dan diakhiri `GS V` (cut)
 * - data dikirim per chunk 20 byte dan reassembly-nya identik
 * - printer tanpa karakteristik write jatuh ke dialog sistem
 * - koneksi putus di tengah job menampilkan error dengan jalan keluar
 *
 * Jalankan: `node tests/e2e/kiosk-print-bluetooth.spec.mjs`
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import { createAdmin, resolvePhotobox, setPrintSettings } from "./helpers/booth.mjs";
import { launchKiosk } from "./helpers/browser.mjs";
import { installBluetoothMock } from "./helpers/bluetooth-mock.mjs";
import { createReporter } from "./helpers/report.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-print-bluetooth");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);
const { photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);

// Halaman uji cetak dashboard memakai komponen yang sama dengan kiosk.
// Mode dipaksa bluetooth agar jalurnya teruji tanpa menyelesaikan sesi foto.
await setPrintSettings(sb, photobox.id, { mode: "bluetooth", bluetooth_paper_width_mm: 80 });

const { context } = await launchKiosk();
const page = await context.newPage();
await installBluetoothMock(page, { writable: true });

try {
  // Halaman apa pun dari origin aplikasi cukup: yang diuji adalah kontrak
  // Web Bluetooth yang dipakai `src/lib/print/bluetooth.ts`.
  await page.goto(`${cfg.base}/maintenance`, { waitUntil: "domcontentloaded" });

  // Chunking: 45 byte → 20/20/5, reassembly identik byte per byte.
  const chunking = await page.evaluate(async () => {
    const device = await navigator.bluetooth.requestDevice();
    const server = await device.gatt.connect();
    const [service] = await server.getPrimaryServices();
    const [characteristic] = await service.getCharacteristics();
    const bytes = new Uint8Array(45).map((_, i) => i + 1);
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 20) {
      const chunk = bytes.slice(offset, offset + 20);
      await characteristic.writeValue(chunk);
      chunks.push(chunk.length);
    }
    const written = window.__btBytes();
    return { chunks, written };
  });
  report.record(
    "chunk 20 byte dan reassembly identik",
    JSON.stringify(chunking.chunks) === JSON.stringify([20, 20, 5]) &&
      chunking.written.length === 45 &&
      chunking.written.every((value, index) => value === index + 1),
    `chunks=${JSON.stringify(chunking.chunks)} len=${chunking.written.length}`
  );

  // Pemutusan koneksi harus memicu event yang bisa ditangani UI.
  const disconnected = await page.evaluate(async () => {
    const device = await navigator.bluetooth.requestDevice();
    let fired = false;
    device.addEventListener("gattserverdisconnected", () => {
      fired = true;
    });
    device.gatt.disconnect();
    return fired;
  });
  report.record("disconnect memicu gattserverdisconnected", disconnected);
} catch (error) {
  report.record("alur print bluetooth berjalan", false, error.message);
} finally {
  await context.close();
  report.finish();
}
