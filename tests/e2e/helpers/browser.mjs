/**
 * Browser harness kiosk: Chromium dengan profil temp + kamera palsu.
 *
 * Catatan mesin ini: profil Chrome asli diblokir macOS, dan kamera fisik
 * membuat renderer crash di harness otomatis. Fake device memberi frame
 * deterministik tanpa hardware.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

export async function launchKiosk({
  viewport = { width: 1366, height: 768 },
  deviceScaleFactor = 1,
  headed = false,
  slowMo = 0,
} = {}) {
  const profileDir = mkdtempSync(join(tmpdir(), "snapyos-e2e-"));
  // E2E_HEADED=1 → jendela Chrome terlihat, supaya operator bisa melihat
  // langkah yang dijalankan (dan memilih printer di dialog asli).
  const headless = process.env.E2E_HEADED === "1" ? false : !headed;
  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    slowMo,
    viewport,
    deviceScaleFactor,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  return { context, profileDir };
}

/** Kumpulkan console error + page error; dipanggil di akhir spec. */
export function collectConsole(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** Suntik token perangkat + tandai setup selesai agar kiosk langsung welcome. */
export async function seedDevice(page, { token, photoboxSlug }) {
  await page.addInitScript(
    ([deviceToken, slug]) => {
      localStorage.setItem("snapyos_device_token", deviceToken);
      localStorage.setItem(`snapyos_device_setup_done:${slug}`, "1");
    },
    [token, photoboxSlug]
  );
}
