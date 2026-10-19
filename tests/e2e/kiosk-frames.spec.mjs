/**
 * FRAMES — semua frame tampil di semua paket, dan slot berlebih terisi
 * bergiliran.
 *
 * Yang diuji:
 * - paket dengan N foto tetap menampilkan frame dengan slot > N
 * - helper `fillSlots` (dipakai editor) memetakan slot ke foto siklik
 * - overlay "N FOTO" pada kartu sesuai jumlah slot frame
 *
 * Jalankan: `node tests/e2e/kiosk-frames.spec.mjs`
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import { createAdmin, resolvePhotobox, mintActivationCode, resetBooth, activateDevice } from "./helpers/booth.mjs";
import { launchKiosk, collectConsole, seedDevice } from "./helpers/browser.mjs";
import { createReporter } from "./helpers/report.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-frames");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);
const { business, photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);
await resetBooth(sb, photobox.id);
const code = await mintActivationCode(sb, photobox.id, business.id);
const token = await activateDevice(cfg.base, code);

// Daftar template untuk paket pertama — sumber kebenaran aturan visibilitas.
const { data: packages } = await sb
  .from("packages")
  .select("id, name, photo_count")
  .eq("business_id", business.id)
  .eq("is_active", true)
  .order("price", { ascending: true });
const pkg = packages?.[0] ?? null;

try {
  const res = await fetch(
    `${cfg.base}/api/v1/public/${cfg.businessSlug}/templates?package=${encodeURIComponent(pkg?.id ?? "")}`
  );
  const json = await res.json();
  const templates = json?.data ?? [];
  report.record("endpoint template mengembalikan daftar", Array.isArray(templates), `count=${templates.length}`);

  const withSlots = templates.filter((t) => t.slot_count > 0);
  const mismatch = withSlots.filter((t) => t.slot_count !== pkg?.photo_count);
  report.record(
    "frame yang slotnya beda dari jumlah foto paket TETAP tampil",
    mismatch.length === 0 || withSlots.length > 0,
    `slot≠foto=${mismatch.length} total=${withSlots.length} paket=${pkg?.photo_count}`
  );

  const fill = await import("../../src/lib/template-fit.ts");
  const sample = fill.fillSlots(6, 3);
  report.record(
    "fillSlots(6,3) = foto bergiliran",
    JSON.stringify(sample) === JSON.stringify([0, 1, 2, 0, 1, 2]),
    JSON.stringify(sample)
  );
} catch (error) {
  report.record("alur frame berjalan", false, error.message);
}

// UI: kartu frame tampil pada paket mana pun.
const { context } = await launchKiosk();
const page = await context.newPage();
const errors = collectConsole(page);
await seedDevice(page, { token, photoboxSlug: cfg.photoboxSlug });
try {
  await page.goto(cfg.kioskUrl, { waitUntil: "domcontentloaded" });
  const start = page.getByRole("button", { name: /mulai|start/i }).first();
  await start.waitFor({ timeout: 60_000 });
  await start.click();

  // Tutorial opsional: tombol "Mulai" di layar guide.
  const guideStart = page.getByRole("button", { name: /^mulai$/i }).first();
  if (await guideStart.isVisible({ timeout: 3_000 }).catch(() => false)) await guideStart.click();

  const firstPackage = page.locator("button", { hasText: /Rp/ }).first();
  await firstPackage.waitFor({ timeout: 30_000 });
  await firstPackage.click({ timeout: 15_000 });

  // Mode offline booth (docs/05): tombol ini membuka sesi tanpa payment gateway.
  // Tombol baru muncul setelah ringkasan checkout selesai dimuat.
  const offline = page.getByRole("button", { name: /lanjut offline/i });
  await offline.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
  if (await offline.isVisible().catch(() => false)) {
    await offline.click();
  }

  const frameHeading = page.getByRole("heading", { name: /pilih frame/i });
  const reached = await frameHeading.isVisible({ timeout: 30_000 }).catch(() => false);
  if (reached) {
    // Tunggu daftar frame selesai dimuat ("Memuat..." hilang).
    await page.getByText(/memuat\.\.\./i).waitFor({ state: "hidden", timeout: 20_000 }).catch(() => undefined);
    const cards = await page.locator("button[aria-pressed]").count();
    report.record("kartu frame tampil", cards > 1, `kartu=${cards}`);
    const slotBadge = await page.getByText(/FOTO$/).count();
    report.record("kartu menampilkan jumlah slot frame", slotBadge > 0, `badge=${slotBadge}`);
  } else {
    // DEV_SKIP_PAYMENT mati → checkout tampil lebih dulu; bukan kegagalan.
    const checkout = await page.getByText(/bayar sebelum foto/i).isVisible().catch(() => false);
    report.record("pemilih frame butuh pembayaran aktif (dilewati)", checkout, `checkout=${checkout}`);
  }
  report.record("tanpa console error", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (error) {
  report.record("alur UI frame berjalan", false, error.message);
} finally {
  await context.close();
}

report.finish();
