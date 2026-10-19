/**
 * LOCK — kiosk terkunci, dan shortcut petugas benar-benar membuka PIN.
 *
 * Regresi yang dijaga: `Ctrl+Alt+X` dulu tertelan cabang `altKey`, jadi
 * tidak ada jalan keluar via keyboard sama sekali.
 *
 * Jalankan: `node tests/e2e/kiosk-lock.spec.mjs`
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import { createAdmin, resolvePhotobox, mintActivationCode, resetBooth, activateDevice } from "./helpers/booth.mjs";
import { launchKiosk, collectConsole, seedDevice } from "./helpers/browser.mjs";
import { createReporter } from "./helpers/report.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-lock");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);

const { business, photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);
await resetBooth(sb, photobox.id);
const code = await mintActivationCode(sb, photobox.id, business.id);
const token = await activateDevice(cfg.base, code);

const { context } = await launchKiosk();
const page = await context.newPage();
const errors = collectConsole(page);
await seedDevice(page, { token, photoboxSlug: cfg.photoboxSlug });

try {
  await page.goto(cfg.kioskUrl, { waitUntil: "domcontentloaded" });
  const welcome = page.getByRole("button", { name: /mulai|start/i });
  await welcome.waitFor({ timeout: 30_000 });
  report.record("kiosk melampaui setup dan menampilkan welcome", true);

  // Escape harus dicegah selama kiosk terkunci.
  const escapePrevented = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
  report.record("Escape diblokir saat kiosk terkunci", escapePrevented);

  // Ctrl+Alt+X ditahan 2 detik → dialog PIN.
  await page.keyboard.down("Control");
  await page.keyboard.down("Alt");
  await page.keyboard.down("x");
  await page.waitForTimeout(2300);
  await page.keyboard.up("x");
  await page.keyboard.up("Alt");
  await page.keyboard.up("Control");

  const dialog = page.getByRole("dialog", { name: /keluar mode kiosk/i });
  const opened = await dialog.isVisible({ timeout: 5_000 }).catch(() => false);
  report.record("Ctrl+Alt+X membuka dialog PIN", opened);

  if (opened) {
    // Escape menutup dialog (aksi batal), kiosk tetap terkunci.
    await page.keyboard.press("Escape");
    report.record(
      "Escape menutup dialog PIN",
      (await dialog.isVisible({ timeout: 3_000 }).catch(() => true)) === false
    );
  }

  // Tombol petugas tap-tahan harus ada dan fokusable.
  const hold = page.getByRole("button", { name: /petugas/i }).first();
  report.record("tombol petugas tersedia", await hold.isVisible().catch(() => false));

  // Kiosk harus tetap bisa dipakai setelah dialog ditutup.
  report.record("welcome masih aktif", await welcome.isVisible({ timeout: 5_000 }).catch(() => false));
} catch (error) {
  report.record("alur lock berjalan", false, error.message);
} finally {
  report.record("tanpa console error", errors.length === 0, errors.slice(0, 3).join(" | "));
  await context.close();
  report.finish();
}
