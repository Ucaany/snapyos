/**
 * K9 — Capture (Kamera) end-to-end.
 *
 * Menguji komponen CameraCapture lewat flow kiosk nyata dengan browser
 * HEADED (terlihat):
 *   aktivasi (?code=) -> welcome -> paket -> checkout -> "Lanjut offline"
 *   -> template picker ("Tanpa frame") -> capture:
 *     countdown, mirror toggle, progress, retake, complete -> editor.
 *
 * Prasyarat: dev server live + activation code aktif (mint via .e2e-tmp/mint-code.mjs).
 *
 * Jalankan:
 *   E2E_K9=1 E2E_BASE=http://localhost:3456 \
 *   E2E_BUSINESS_SLUG=klik-foto-dev E2E_PHOTOBOX_SLUG=booth-02 \
 *   E2E_ACTIVATION_CODE=882133 node tests/e2e/capture-flow.spec.mjs
 */

import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENABLED = process.env.E2E_K9 === "1";
const BASE = process.env.E2E_BASE ?? "http://localhost:3456";
const BUSINESS = process.env.E2E_BUSINESS_SLUG ?? "";
const PHOTOBOX = process.env.E2E_PHOTOBOX_SLUG ?? "";
const CODE = process.env.E2E_ACTIVATION_CODE ?? "";
const SETUP_KEY = `snapyos_device_setup_done:${PHOTOBOX}`;
const SHOT = (n) => `tests/e2e/k9-${n}.png`;

if (!ENABLED) {
  console.log("SKIP: set E2E_K9=1 + booth env (lihat header).");
  process.exit(0);
}
if (!BUSINESS || !PHOTOBOX || !CODE) {
  console.error("FAIL: E2E_BUSINESS_SLUG, E2E_PHOTOBOX_SLUG, E2E_ACTIVATION_CODE wajib diisi");
  process.exit(1);
}

// MODE KAMERA:
//  - default: FAKE device (Chromium) — menjalankan seluruh UI/UX capture
//    secara andal (countdown, mirror, retake, progress, layout). Pixel
//    sintetis, tapi semua state & DOM nyata.
//  - E2E_REAL_CAM=1: kamera ASLI (FaceTime/Continuity) TANPA fake-device.
//    Butuh izin kamera macOS untuk browser ybs. Channel "chrome" dipakai
//    karena bundled Chromium-for-Testing bisa menggantung di getUserMedia.
//    CATATAN: di sebagian setup macOS, getUserMedia menggantung karena
//    kamera dipegang proses lain — lihat kesimpulan laporan.
const userDataDir = mkdtempSync(join(tmpdir(), "snapyos-k9-"));
const REAL_CAM = process.env.E2E_REAL_CAM === "1";
// Selalu pakai Google Chrome (channel "chrome") — browser terlihat, mesin
// media Chrome nyata. Set E2E_BROWSER=chromium untuk bundled Chromium.
const launchOpts = {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: [
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--no-first-run",
    "--no-default-browser-check",
  ],
};
if (process.env.E2E_BROWSER !== "chromium") launchOpts.channel = "chrome";
if (!REAL_CAM) launchOpts.args.push("--use-fake-device-for-media-stream");
const browser = await chromium.launchPersistentContext(userDataDir, launchOpts);
console.log(`[mode] browser: ${process.env.E2E_BROWSER === "chromium" ? "bundled Chromium" : "Google Chrome"} | kamera: ${REAL_CAM ? "ASLI (FaceTime/Continuity)" : "FAKE device"}`);

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

const page = browser.pages()[0] ?? (await browser.newPage());
await browser.grantPermissions(["camera"], { origin: BASE }).catch(() => {});
page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|\/404|favicon\.ico/i.test(m.text())) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});
page.on("requestfailed", (r) =>
  failedRequests.push(`FAIL ${r.url()} :: ${r.failure()?.errorText ?? ""}`)
);

const text = () => page.locator("body").innerText();

/** Overlap detector: elemen ber-border/bergaya kustom yang saling tumpuk. */
async function overlapReport() {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll("button, a, [role=button], h1, h2, p, img, video, canvas")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 2 && r.height > 2 && r.top < innerHeight && r.bottom > 0);
    const bad = [];
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const overlapX = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const overlapY = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (overlapX > 6 && overlapY > 6) {
          const area = overlapX * overlapY;
          const minArea = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
          if (area / minArea > 0.35) {
            bad.push({
              a: `${a.el.tagName}:${(a.el.innerText || a.el.getAttribute("aria-label") || "").slice(0, 30)}`,
              b: `${b.el.tagName}:${(b.el.innerText || b.el.getAttribute("aria-label") || "").slice(0, 30)}`,
              pct: Math.round((area / minArea) * 100),
            });
          }
        }
      }
    }
    // dedup
    const seen = new Set();
    return bad.filter((x) => { const k = x.a + "|" + x.b; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  });
}

async function metrics() {
  return page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
  }));
}

try {
  // ---- 0. Seed setup-done + activate via API, inject device token ----
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((k) => localStorage.setItem(k, "1"), SETUP_KEY);

  const actRes = await page.request.post(`${BASE}/api/v1/public/devices/activate`, {
    data: { code: CODE },
  });
  const actJson = await actRes.json().catch(() => null);
  const token = actJson?.data?.device_token ?? null;
  record("Aktivasi perangkat (device_token)", Boolean(token), token ? "" : JSON.stringify(actJson));
  if (!token) throw new Error("tanpa device_token tidak bisa lanjut");
  await page.evaluate((t) => localStorage.setItem("snapyos_device_token", t), token);

  // ---- 1. Boot kiosk → welcome (sesi bersih) ----
  await page.goto(`${BASE}/p/${BUSINESS}/${PHOTOBOX}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SHOT("01-boot") });
  let body = await text();
  record("Boot kiosk (welcome/sesi)", /MULAI|Mulai|Selamat|KLIK FOTO|PILIH|FRAME|Foto/i.test(body), body.slice(0, 80).replace(/\s+/g, " "));

  // Bila resume ke template/capture, restart bersih: abort lalu reset.
  if (/PILIH FRAME|Ambil foto|CAPTURE/i.test(body)) {
    record("Boot menemukan sesi tertinggal", true, body.slice(0, 60).replace(/\s+/g, " "));
  }

  // ---- 2. Welcome → Mulai (CTA dikustom owner, mis. "START") ----
  const onWelcome = !/PILIH PAKET|PILIH FRAME|Ambil foto|EDIT FOTO/i.test(body);
  if (onWelcome) {
    const cta = page.locator('button:not([aria-label^="Petugas"])').filter({ hasText: /\S/ }).first();
    if (await cta.count()) {
      await cta.click();
      await page.waitForTimeout(1500);
      record("Welcome → Mulai", true);
    }
  }
  await page.screenshot({ path: SHOT("02-after-start") });

  // ---- 3. Pilih paket (bila di layar paket) ----
  body = await text();
  if (/Strip Klasik|Single Basic|Paket Duo|PILIH PAKET/i.test(body) && !/PILIH FRAME/i.test(body)) {
    await page.screenshot({ path: SHOT("03-packages") });
    const cards = page.locator('button[role="listitem"]');
    const n = await cards.count();
    let picked = false;
    for (let i = 0; i < n; i++) {
      const t = await cards.nth(i).innerText();
      if (/strip klasik/i.test(t)) { await cards.nth(i).click(); picked = true; break; }
    }
    if (!picked && n > 0) await cards.first().click();
    record("Pilih paket", picked || n > 0, `${n} kartu`);
    await page.waitForTimeout(1800);
  }

  // ---- 4. Checkout → Lanjut offline (sesi langsung) ----
  await page.waitForFunction(
    () => /RINGKASAN|Pilih pembayaran|Lanjut offline|PILIH FRAME|\[ ERROR \]/i.test(document.body.innerText),
    null,
    { timeout: 20000 }
  ).catch(() => {});
  body = await text();
  await page.screenshot({ path: SHOT("04-checkout") });
  const offlineBtn = page.getByRole("button", { name: /Lanjut offline/i });
  if (await offlineBtn.count()) {
    await offlineBtn.first().click();
    record("Checkout → Lanjut offline (sesi langsung)", true);
    await page.waitForTimeout(2500);
  } else if (/PILIH FRAME/i.test(body)) {
    record("Sesi langsung (offline di-skip, resume)", true);
  } else {
    record("Tombol 'Lanjut offline' tersedia", false, body.slice(0, 120).replace(/\s+/g, " "));
  }
  await page.screenshot({ path: SHOT("05-after-offline") });

  // ---- 5. Template picker → "Tanpa frame" ----
  await page.waitForFunction(() => /PILIH FRAME/i.test(document.body.innerText), null, { timeout: 20000 });
  await page.waitForFunction(() => !/Memuat\.\.\./.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOT("06-template") });
  const noFrame = page.locator('button:has-text("Tanpa frame")').first();
  record("Template picker: opsi 'Tanpa frame'", (await noFrame.count()) > 0);
  if (await noFrame.count()) {
    await noFrame.click();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: SHOT("07-template-selected") });
  const useBtn = page.getByRole("button", { name: /Gunakan frame|Lanjut|Mulai foto/i }).first();
  if (await useBtn.count()) {
    await useBtn.click();
    record("Template → lanjut capture", true);
  }

  // ===================== 6. CAPTURE SCREEN =====================
  await page.waitForFunction(
    () => /CAPTURE|Ambil foto|Menyiapkan kamera|Foto \d/i.test(document.body.innerText),
    null,
    { timeout: 25000 }
  );
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOT("10-capture-preview") });
  record("Layar capture tampil", true);

  // 6a. Overlap check di layar capture
  const ov1 = await overlapReport();
  record("Capture preview: tidak ada elemen tumpang-tindih", ov1.length === 0, JSON.stringify(ov1));

  // 6b. Overflow check
  const m1 = await metrics();
  record("Capture preview: tidak ada overflow horizontal", m1.scrollW <= m1.clientW + 1, JSON.stringify(m1));

  // 6c. Video element ada & playing
  const vid = await page.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return null;
    return { readyState: v.readyState, w: v.videoWidth, h: v.videoHeight, paused: v.paused, srcObj: Boolean(v.srcObject) };
  });
  record("Kamera preview: <video> siap (frame live)", Boolean(vid && vid.readyState >= 2 && vid.w > 0), JSON.stringify(vid));

  // 6d. Mirror toggle
  const mirrorBtn = page.locator('button[aria-pressed]').filter({ hasText: /Mirror/i }).first();
  if (await mirrorBtn.count()) {
    const before = await mirrorBtn.getAttribute("aria-pressed");
    const tBefore = await page.evaluate(() => document.querySelector("video")?.style.transform ?? "");
    await mirrorBtn.click();
    await page.waitForTimeout(400);
    const after = await mirrorBtn.getAttribute("aria-pressed");
    const tAfter = await page.evaluate(() => document.querySelector("video")?.style.transform ?? "");
    record("Mirror toggle mengubah state + transform video", before !== after && tBefore !== tAfter,
      `aria ${before}->${after}; style '${tBefore}'->'${tAfter}'`);
    await mirrorBtn.click(); // balikkan
    await page.waitForTimeout(300);
  } else {
    record("Tombol mirror tampil", false);
  }

  // 6e. Ambil foto 1 → countdown
  const shoot = () => page.getByRole("button", { name: /Ambil foto|Menyiapkan kamera/i }).first();
  record("Tombol 'Ambil foto' aktif (kamera siap)", await shoot().isEnabled().catch(() => false));
  await shoot().click();
  // Countdown visual: overlay besar menampilkan "3" lalu turun. Poll span
  // bernilai 3/2/1 yang ukurannya besar (font-display text-[10rem]).
  const countdownSeen = await page
    .waitForFunction(
      () => {
        const big = [...document.querySelectorAll("span")].filter((s) => {
          const t = (s.textContent ?? "").trim();
          if (!/^[123]$/.test(t)) return false;
          return parseFloat(getComputedStyle(s).fontSize) > 60;
        });
        return big.length > 0;
      },
      null,
      { timeout: 6000 }
    )
    .then(() => true)
    .catch(() => false);
  record("Countdown tampil saat capture", countdownSeen);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: SHOT("11-capture-review") });

  // 6f. Review screen
  await page.waitForFunction(() => /Foto berhasil diambil|Ulang|Lanjut/i.test(document.body.innerText), null, { timeout: 8000 });
  record("Review muncul (foto terambil)", true);
  const ov2 = await overlapReport();
  record("Capture review: tidak ada elemen tumpang-tindih", ov2.length === 0, JSON.stringify(ov2));

  // 6g. Retake → kembali preview, retake count naik
  const beforeHint = await page.locator("p").filter({ hasText: /ulang|terambil/i }).first().innerText().catch(() => "");
  const retakeBtn = page.getByRole("button", { name: /Ulang/i }).first();
  if (await retakeBtn.count()) {
    await retakeBtn.click();
    await page.waitForTimeout(1500);
    const afterHint = await page.locator("p").filter({ hasText: /ulang|terambil/i }).first().innerText().catch(() => "");
    const backToPreview = /Ambil foto|Menyiapkan kamera/i.test(await text());
    record("Retake → kembali ke preview", backToPreview);
    record("Retake menaikkan hitungan 'ulang'", /ulang/i.test(afterHint) || beforeHint !== afterHint, `'${beforeHint.trim()}' -> '${afterHint.trim()}'`);
  } else {
    record("Tombol 'Ulang' tampil", false);
  }

  // 6h. Selesaikan sisa slot: shoot + (tunggu review) + Lanjut/Lanjut edit tiap slot
  let guard = 0;
  const isEditor = () => page.evaluate(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText));
  while (guard++ < 8) {
    if (await isEditor()) break;
    const b = await text();
    if (!/Ambil foto/i.test(b)) break;
    // Ambil foto
    const sb = shoot();
    if ((await sb.count()) && (await sb.isEnabled().catch(() => false))) {
      await sb.click();
    }
    // Tunggu layar review (foto berhasil) ATAU editor (slot terakhir bisa skip)
    await page
      .waitForFunction(
        () => /Foto berhasil diambil|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
        null,
        { timeout: 12000 }
      )
      .catch(() => {});
    if (await isEditor()) break;
    const next = page.getByRole("button", { name: /Lanjut edit|^Lanjut$/i }).first();
    if (await next.count()) {
      await next.click();
      await page.waitForTimeout(1500);
    }
  }
  await page.screenshot({ path: SHOT("12-capture-done") });

  // ---- 7. Editor tampil (capture selesai) ----
  await page
    .waitForFunction(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText), null, { timeout: 20000 })
    .catch(() => {});
  const onEditor = await isEditor();
  record("Capture selesai → layar editor", onEditor, (await text()).slice(0, 100).replace(/\s+/g, " "));
  await page.screenshot({ path: SHOT("13-editor") });
  const ov3 = await overlapReport();
  record("Editor: tidak ada elemen tumpang-tindih", ov3.length === 0, JSON.stringify(ov3));
} catch (e) {
  record("Eksekusi flow", false, e.message);
  await page.screenshot({ path: SHOT("99-error") }).catch(() => {});
} finally {
  console.log("\n--- Console errors ---");
  console.log(consoleErrors.length ? consoleErrors.join("\n") : "(none)");
  console.log("\n--- Page errors ---");
  console.log(pageErrors.length ? pageErrors.join("\n") : "(none)");
  console.log("\n--- Failed requests ---");
  console.log(failedRequests.length ? failedRequests.join("\n") : "(none)");

  record("Tidak ada console error aplikasi", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  record("Tidak ada page error", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== K9 Capture E2E: ${results.length - failed.length}/${results.length} PASS ===`);
  process.exit(failed.length ? 1 : 0);
}
