/**
 * K8 — Template Picker (Frame) end-to-end.
 *
 * Menguji komponen TemplatePicker lewat flow kiosk nyata:
 *   aktivasi (?code=) -> setup (di-skip via localStorage) -> welcome ->
 *   paket -> template picker (grid, pilih, preview, gunakan frame) -> capture.
 *
 * Prasyarat: booth live + activation code aktif di Supabase, package_templates
 * sudah di-assign untuk paket yang diuji.
 *
 * Jalankan:
 *   E2E_K8=1 \
 *   E2E_BASE=http://localhost:3456 \
 *   E2E_BUSINESS_SLUG=klik-foto-dev \
 *   E2E_PHOTOBOX_SLUG=booth-02 \
 *   E2E_ACTIVATION_CODE=E2E211 \
 *   node tests/e2e/template-picker-flow.spec.mjs
 *
 * Browser: Chromium HEADED (terlihat). Persistent context agar localStorage
 * (device_token + setup_done) tersimpan antar navigasi, tidak login berulang.
 */

import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENABLED = process.env.E2E_K8 === "1";
const BASE = process.env.E2E_BASE ?? "http://localhost:3456";
const BUSINESS = process.env.E2E_BUSINESS_SLUG ?? "";
const PHOTOBOX = process.env.E2E_PHOTOBOX_SLUG ?? "";
const CODE = process.env.E2E_ACTIVATION_CODE ?? "";
const SETUP_KEY = `snapyos_device_setup_done:${PHOTOBOX}`;

if (!ENABLED) {
  console.log("SKIP: set E2E_K8=1 + booth env untuk menjalankan (lihat header file).");
  process.exit(0);
}
if (!BUSINESS || !PHOTOBOX || !CODE) {
  console.error("FAIL: E2E_BUSINESS_SLUG, E2E_PHOTOBOX_SLUG, E2E_ACTIVATION_CODE wajib diisi");
  process.exit(1);
}

const userDataDir = mkdtempSync(join(tmpdir(), "snapyos-k8-"));

const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

const results = [];
const consoleErrors = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

const page = browser.pages()[0] ?? (await browser.newPage());
await browser.grantPermissions(["camera"], { origin: BASE }).catch(() => {});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/i.test(m.text())) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});

try {
  // ---- 0. Pre-seed setup flag agar setup wizard di-skip ----
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ k }) => localStorage.setItem(k, "1"), { k: SETUP_KEY });

  // ---- 0b. Aktifkan perangkat lewat API (deterministik, hindari re-pairing
  //     yang selalu memaksa setup wizard). Token di-inject ke localStorage
  //     lalu boot verify -> welcome (flag setup sudah ada).
  const actRes = await page.request.post(`${BASE}/api/v1/public/devices/activate`, {
    data: { code: CODE },
  });
  const actJson = await actRes.json().catch(() => null);
  const token = actJson?.data?.device_token ?? null;
  record("Aktivasi perangkat via API (device_token)", Boolean(token), token ? "" : JSON.stringify(actJson));
  if (token) {
    await page.evaluate((t) => localStorage.setItem("snapyos_device_token", t), token);
  }
  await page.goto(`${BASE}/p/${BUSINESS}/${PHOTOBOX}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  let bootBody = await page.locator("body").innerText();
  console.log("[diag] post-boot body:", bootBody.slice(0, 200).replace(/\s+/g, " "));
  await page.screenshot({ path: "tests/e2e/k8-00-post-activation.png" });

  // Bila sesi aktif tertinggal (dev data), boot bisa langsung ke template.
  const bootResumed = /PILIH FRAME|Pilih frame/i.test(bootBody);

  if (bootResumed) {
    record("Boot resume langsung ke template picker", true, "sesi aktif tertinggal");
  } else {
    // ---- 2. Welcome (judul = nama bisnis bila welcome_title kosong) ----
    await page.waitForFunction(
      () => /KLIK FOTO DEV|Selamat datang|MULAI|Mulai/i.test(document.body.innerText),
      null,
      { timeout: 15000 }
    );
    await page.screenshot({ path: "tests/e2e/k8-01-welcome.png" });
    record("Layar welcome tampil", true);

    // ---- 3. Mulai -> paket / (resume) template / checkout ----
    const startBtn = page.locator("button").filter({ hasText: /Mulai/i }).first();
    await startBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "tests/e2e/k8-03-after-start.png" });
    let body = await page.locator("body").innerText();
    console.log("[diag] after-start body:", body.slice(0, 400).replace(/\s+/g, " "));

    const onTemplate = /PILIH FRAME|Pilih frame/i.test(body);
    const onPackage = /Strip Klasik|Single Basic|Paket Duo/i.test(body) && !onTemplate;
    const onCheckout = /BAYAR SEBELUM FOTO|MENYIAPKAN PEMBAYARAN|QRIS/i.test(body);

    if (onTemplate) {
      record("Layar pilih paket (di-skip: resume sesi aktif)", true, "langsung ke template");
    } else if (onPackage) {
      record("Layar pilih paket tampil", true);
      await page.screenshot({ path: "tests/e2e/k8-02-packages.png" });
      const pkgCards = page.locator('button[role="listitem"]');
      const pkgTotal = await pkgCards.count();
      console.log("[diag] package cards:", pkgTotal);
      let clickedPkg = false;
      for (let i = 0; i < pkgTotal; i++) {
        const t = await pkgCards.nth(i).innerText();
        if (/strip klasik/i.test(t)) { await pkgCards.nth(i).click(); clickedPkg = true; break; }
      }
      if (!clickedPkg && pkgTotal > 0) { await pkgCards.first().click(); clickedPkg = true; }
      record("Pilih paket (Strip Klasik)", clickedPkg);
      await page.waitForTimeout(1800);
      body = await page.locator("body").innerText();
      console.log("[diag] after-package body:", body.slice(0, 300).replace(/\s+/g, " "));
      if (/BAYAR SEBELUM FOTO|MENYIAPKAN PEMBAYARAN|QRIS|CHECKOUT/i.test(body)) {
        record("Checkout tampil", true);
        await page.screenshot({ path: "tests/e2e/k8-04-checkout.png" });
        await page.waitForFunction(
          () => /RINGKASAN PESANAN|Pilih pembayaran|\[ ERROR \]/i.test(document.body.innerText),
          null,
          { timeout: 15000 }
        );
        const summaryBody = await page.locator("body").innerText();
        console.log("[diag] checkout phase body:", summaryBody.slice(0, 300).replace(/\s+/g, " "));
        const offlineBtn = page.getByRole("button", { name: /Lanjut offline/i });
        if (await offlineBtn.count()) {
          await offlineBtn.first().click();
          record("Checkout -> Lanjut offline (sesi langsung)", true);
          await page.waitForTimeout(2500);
        } else {
          record("Tombol 'Lanjut offline' tersedia", false, "offline mode tidak aktif / tidak muncul");
          await page.screenshot({ path: "tests/e2e/k8-05-checkout-summary.png" });
        }
      } else if (/PILIH FRAME|Pilih frame/i.test(body)) {
        record("Paket -> template picker", true);
      }
    } else if (onCheckout) {
      record("Checkout tampil", true, "paket di-skip (resume)");
      const offlineBtn = page.getByRole("button", { name: /Lanjut offline/i });
      if (await offlineBtn.count()) {
        await offlineBtn.first().click();
        record("Checkout -> Lanjut offline (sesi langsung)", true);
        await page.waitForTimeout(2000);
      }
    }
  }

  // ---- 4/5. Template picker ----
  {
    await page.waitForSelector("text=PILIH FRAME", { timeout: 10000 });
    await page.waitForFunction(() => !/Memuat\.\.\./.test(document.body.innerText), null, { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/k8-06-template-picker.png" });
    const bodyText = await page.locator("body").innerText();
    const countMatch = bodyText.match(/(\d+)\s*frame/i);
    const frameCount = countMatch ? Number(countMatch[1]) : 0;
    record("Grid template termuat (bukan loading/error)", frameCount > 0, `${frameCount} frame`);

    // Tombol "Tanpa frame" selalu ada.
    const noFrame = page.getByText(/Tanpa frame/i);
    const noFrameCount = await noFrame.count();
    record("Opsi 'Tanpa frame' tersedia", noFrameCount > 0, `matches=${noFrameCount}`);
    const noFrameRole = await page.locator('button:has-text("Tanpa frame")').first().getAttribute("role");
    record("A11y: tombol frame punya role button (bukan listitem)", noFrameRole !== "listitem", `role=${noFrameRole ?? "button(implicit)"}`);
    const ariaPressed = await page.locator('button:has-text("Tanpa frame")').first().getAttribute("aria-pressed");
    record("A11y: state terpilih lewat aria-pressed", ariaPressed !== null, `aria-pressed=${ariaPressed}`);

    // Cek overflow horizontal (R-03) di viewport kiosk.
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    record("Tidak ada overflow horizontal (desktop)", overflow.scrollW <= overflow.clientW + 1, JSON.stringify(overflow));

    // Pilih salah satu template via keyboard (focus) — R-32.
    const focusable = await page.evaluate(() => {
      const cards = document.querySelectorAll('[aria-pressed]');
      const t = cards[cards.length - 1];
      if (!t) return null;
      t.focus();
      return document.activeElement === t;
    });
    record("Card frame dapat difokus (keyboard)", focusable === true);

    // Pilih satu template ber-frame (bukan tombol "Tanpa frame")
    const cards = page.locator('button[aria-pressed]');
    const total = await cards.count();
    let picked = null;
    for (let i = 0; i < total; i++) {
      const txt = await cards.nth(i).innerText();
      if (!/Tanpa frame/i.test(txt)) { picked = cards.nth(i); break; }
    }
    if (picked) {
      await picked.click();
      await page.waitForSelector("text=Preview frame", { timeout: 5000 });
      await page.screenshot({ path: "tests/e2e/k8-07-template-selected.png" });
      record("Pilih frame -> preview muncul", true);
      const useBtn = page.getByRole("button", { name: /Gunakan frame/i });
      record("Tombol 'Gunakan frame' muncul", (await useBtn.count()) > 0);
      if ((await useBtn.count()) > 0) {
        await useBtn.click();
        await page.waitForFunction(
          () => /Ambil|kamera|Siapkan camera|capture|Sesi|rekam/i.test(document.body.innerText),
          null,
          { timeout: 15000 }
        );
        record("'Gunakan frame' -> lanjut ke capture", true);
      }
    } else {
      record("Ada frame untuk dipilih", false, "hanya 'Tanpa frame'");
    }
  }
} catch (e) {
  record("Eksekusi flow", false, e.message);
} finally {
  console.log("\n--- Console errors ---");
  console.log(consoleErrors.length ? consoleErrors.join("\n") : "(none)");
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== K8 E2E: ${results.length - failed.length}/${results.length} PASS ===`);
  process.exit(failed.length ? 1 : 0);
}
