/**
 * FULL FRAME FLOW — paket 2 foto/2 cetak memakai frame 6 slot.
 *
 * Membuktikan kontrak yang paling mudah drift:
 * - frame 6 slot memaksa enam capture, bukan package.photo_count=2;
 * - editor menerima enam foto dan menghasilkan satu canvas composite 2:3;
 * - server menerima finalize composite + enam capture mentah untuk GIF.
 *
 * Prasyarat: dev server dengan DEV_SKIP_PAYMENT=true + Supabase service role.
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import {
  activateDevice,
  createAdmin,
  mintActivationCode,
  resetBooth,
  resolvePhotobox,
  setPrintSettings,
} from "./helpers/booth.mjs";
import { collectConsole, launchKiosk, seedDevice } from "./helpers/browser.mjs";
import { captureAll } from "./helpers/flows.mjs";
import { createReporter } from "./helpers/report.mjs";
import { acquirePrintLock } from "./helpers/print-lock.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-full-frame-flow");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);
const { business, photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);
await resetBooth(sb, photobox.id);
const previousPrintSettings = photobox.print_settings ?? {};
const releasePrintLock = await acquirePrintLock();

try {
  await setPrintSettings(sb, photobox.id, {
    mode: "browser",
    auto_print: false,
    copies: 1,
    paper_size: "4x6",
    orientation: "portrait",
    margins_mm: 4,
  });
  const code = await mintActivationCode(sb, photobox.id, business.id);
  const token = await activateDevice(cfg.base, code);
  const { context } = await launchKiosk({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = collectConsole(page);
  const finalizeResponses = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/finalize")) return;
    let parsed = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    finalizeResponses.push({
      status: response.status(),
      code: parsed?.error?.code ?? null,
      sessionStatus: parsed?.data?.status ?? null,
    });
  });
  // PrintFlow tetap boleh masuk ke result tanpa membuka dialog OS pada CI.
  await page.addInitScript(() => {
    window.print = () => window.setTimeout(() => window.dispatchEvent(new Event("afterprint")), 0);
  });
  await seedDevice(page, { token, photoboxSlug: cfg.photoboxSlug });

  try {
    await page.goto(cfg.kioskUrl, { waitUntil: "domcontentloaded" });
    const start = page.getByRole("button", { name: /mulai|start/i }).first();
    await start.waitFor({ timeout: 60_000 });
    await start.click();

    const guideStart = page.getByRole("button", { name: /^mulai$/i }).first();
    if (await guideStart.isVisible({ timeout: 3_000 }).catch(() => false)) await guideStart.click();

    const duo = page.getByRole("button", { name: /paket duo/i }).first();
    await duo.waitFor({ timeout: 30_000 });
    await duo.click({ force: true });

    const frameHeading = page.getByRole("heading", { name: /pilih frame/i });
    await frameHeading.waitFor({ timeout: 30_000 });
    await page
      .getByText(/memuat\.\.\./i)
      .waitFor({ state: "hidden", timeout: 20_000 })
      .catch(() => undefined);

    const sixSlotFrame = page.getByRole("button", { name: /^33\b/i }).first();
    await sixSlotFrame.waitFor({ timeout: 30_000 });
    await sixSlotFrame.click();
    await page.getByRole("button", { name: /gunakan frame/i }).click();

    await captureAll(page, 6);
    await page
      .getByText(/edit foto/i)
      .first()
      .waitFor({ timeout: 30_000 });

    const photoControls = await page.getByRole("button", { name: /^Foto [1-6]$/i }).count();
    report.record(
      "frame 6 slot menentukan enam capture",
      photoControls === 6,
      `controls=${photoControls}`
    );
    report.record("editor menerima enam foto", photoControls === 6, `controls=${photoControls}`);

    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 30_000 });
    const composite = await canvas.evaluate((element) => {
      const node = element;
      const pixels = node.getContext("2d")?.getImageData(0, 0, node.width, node.height).data;
      let nonTransparent = 0;
      if (pixels) {
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) nonTransparent += 1;
      }
      return {
        width: node.width,
        height: node.height,
        ratio: node.width / Math.max(1, node.height),
        nonTransparent,
      };
    });
    report.record(
      "composite frame utuh dengan rasio 1200x1800",
      composite.width > 0 && composite.height > 0 && Math.abs(composite.ratio - 2 / 3) < 0.01,
      JSON.stringify(composite)
    );
    report.record(
      "frame dan slot menghasilkan piksel composite",
      composite.nonTransparent > 0,
      JSON.stringify(composite)
    );

    const finalizeResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/finalize"),
      { timeout: 90_000 }
    );
    await page.getByRole("button", { name: /^selesai$/i }).click({ force: true });
    const finalizeResponse = await finalizeResponsePromise.catch(async (error) => {
      const screen = (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(-1_000);
      throw new Error(`${error.message}; screen=${screen}`);
    });
    await finalizeResponse.finished();
    await page.locator(".print-sheet").first().waitFor({ state: "attached", timeout: 30_000 });
    const printSheetCount = await page.locator(".print-sheet").count();
    report.record(
      "print_count paket menghasilkan dua lembar",
      printSheetCount === 2,
      `printSheets=${printSheetCount}`
    );
    await page
      .getByRole("button", { name: /^lanjut$/i })
      .last()
      .click({ force: true });
    const resultHeading = page
      .getByText(/foto kamu jadi|hasil digital siap|permintaan print dikirim/i)
      .first();
    const resultVisible = await resultHeading.isVisible({ timeout: 90_000 }).catch(() => false);
    report.record(
      "finalize dan alur hasil selesai",
      resultVisible,
      finalizeResponses.length > 0
        ? JSON.stringify(finalizeResponses.at(-1))
        : "no finalize response"
    );
    report.record("tanpa console error", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await context.close();
  }
} finally {
  await resetBooth(sb, photobox.id);
  await sb
    .from("photoboxes")
    .update({ print_settings: previousPrintSettings })
    .eq("id", photobox.id);
  await releasePrintLock();
}

report.finish();
