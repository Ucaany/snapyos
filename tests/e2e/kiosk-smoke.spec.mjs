/**
 * SMOKE — kiosk bisa dibuka, aktivasi berhasil, dan welcome tampil tanpa error.
 *
 * Prasyarat: dev server (`npm run dev`) + `.env.local` service role.
 * Jalankan: `node tests/e2e/kiosk-smoke.spec.mjs`
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import { createAdmin, resolvePhotobox, mintActivationCode, resetBooth } from "./helpers/booth.mjs";
import { launchKiosk, collectConsole } from "./helpers/browser.mjs";
import { createReporter } from "./helpers/report.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-smoke");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);

const { business, photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);
await resetBooth(sb, photobox.id);
const code = await mintActivationCode(sb, photobox.id, business.id);

const { context } = await launchKiosk();
const page = await context.newPage();
const errors = collectConsole(page);

try {
  await page.goto(cfg.kioskUrl, { waitUntil: "domcontentloaded" });
  // Kiosk tanpa token tersimpan menampilkan layar aktivasi. Judulnya memakai
  // `font-display` (bukan heading semantik), jadi dicari lewat teks. React
  // memasang handler setelah hidrasi, jadi tunggu tombolnya benar-benar aktif.
  const activateButton = page.getByRole("button", { name: /^aktifkan$/i });
  await activateButton.waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
  const activation = page.getByText(/masukkan kode aktivasi/i).first();
  const active = await activation.isVisible({ timeout: 10_000 }).catch(() => false);
  report.record("layar aktivasi tampil", active, page.url());

  if (active) {
    await page.getByLabel(/kode aktivasi/i).fill(code);
    await activateButton.click();
  }

  const setup = page.getByText(/siapkan kamera/i).first();
  // Tombol CTA memakai label owner (default "START"/"Mulai") — cocokkan teks
  // tombol, bukan heading, karena welcome tidak punya heading semantik.
  const welcome = page.getByRole("button", { name: /mulai|start/i }).first();
  const reached = await Promise.race([
    setup.waitFor({ timeout: 40_000 }).then(() => "setup"),
    welcome.waitFor({ timeout: 40_000 }).then(() => "welcome"),
  ]).catch(() => null);
  report.record("aktivasi membuka setup atau welcome", reached !== null, reached ?? "timeout");

  if (reached === "setup") {
    // Tombol nonaktif sampai track kamera hidup; tunggu sampai bisa diklik.
    const next = page.getByRole("button", { name: /lanjut ke uji cetak/i });
    const ready = await next.isEnabled({ timeout: 30_000 }).catch(() => false);
    report.record("kamera siap sebelum lanjut", ready);
    if (ready) await next.click();
    // Tanpa printer fisik: lewati uji cetak. Jalur ini sengaja disediakan
    // untuk booth yang printernya belum siap dan tetap harus bisa beroperasi.
    const skipPrint = page.getByRole("button", { name: /lewati uji cetak/i });
    await skipPrint.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
    if (await skipPrint.isVisible().catch(() => false)) await skipPrint.click();
    report.record(
      "setup bisa diselesaikan",
      await welcome.isVisible({ timeout: 20_000 }).catch(() => false)
    );
  }

  const html = await page.locator("html").getAttribute("lang");
  report.record("halaman berbahasa Indonesia", html === "id", html ?? "tidak ada lang");
} catch (error) {
  report.record("alur berjalan tanpa exception", false, error.message);
} finally {
  report.record("tanpa console error", errors.length === 0, errors.slice(0, 3).join(" | "));
  await context.close();
  report.finish();
}
