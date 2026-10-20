/**
 * RESPONSIVE — kiosk tidak overflow horizontal dan punya SATU sumbu scroll
 * di setiap ukuran perangkat yang dipakai di lapangan.
 *
 * Jalankan: `node tests/e2e/kiosk-responsive.spec.mjs`
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import {
  createAdmin,
  resolvePhotobox,
  mintActivationCode,
  resetBooth,
  activateDevice,
} from "./helpers/booth.mjs";
import { launchKiosk, collectConsole, seedDevice } from "./helpers/browser.mjs";
import { createReporter } from "./helpers/report.mjs";

const VIEWPORTS = [
  { name: "iPad landscape", width: 1024, height: 768 },
  { name: "iPad portrait", width: 768, height: 1024 },
  { name: "Mini PC", width: 1366, height: 768 },
  { name: "Panel 800x480", width: 800, height: 480 },
  { name: "Ponsel", width: 390, height: 844 },
];

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-responsive");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);
const { business, photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);
await resetBooth(sb, photobox.id);
const code = await mintActivationCode(sb, photobox.id, business.id);
const token = await activateDevice(cfg.base, code);

for (const viewport of VIEWPORTS) {
  const { context } = await launchKiosk({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  const errors = collectConsole(page);
  await seedDevice(page, { token, photoboxSlug: cfg.photoboxSlug });

  try {
    await page.goto(cfg.kioskUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /mulai|start/i }).waitFor({ timeout: 30_000 });

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const shell = document.querySelector('[data-kiosk-shell="true"]');
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        bodyScroll: document.body.scrollHeight,
        bodyClient: document.body.clientHeight,
        shellOverflow: shell ? getComputedStyle(shell).overflow : "missing",
        shellHeight: shell ? shell.getBoundingClientRect().height : 0,
        viewport: window.innerHeight,
      };
    });

    report.record(
      `${viewport.name}: tanpa overflow horizontal`,
      metrics.scrollWidth <= metrics.clientWidth + 1,
      `scroll=${metrics.scrollWidth} client=${metrics.clientWidth}`
    );
    report.record(
      `${viewport.name}: shell setinggi viewport (satu sumbu scroll)`,
      Math.abs(metrics.shellHeight - metrics.viewport) <= 1 && metrics.shellOverflow === "hidden",
      `shell=${Math.round(metrics.shellHeight)} viewport=${metrics.viewport} overflow=${metrics.shellOverflow}`
    );
    report.record(
      `${viewport.name}: tanpa console error`,
      errors.length === 0,
      errors.slice(0, 2).join(" | ")
    );
  } catch (error) {
    report.record(`${viewport.name}: kiosk terbuka`, false, error.message);
  } finally {
    await context.close();
  }
}

report.finish();
