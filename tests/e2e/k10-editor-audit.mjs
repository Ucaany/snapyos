/**
 * K10 — Editor (Edit Foto) E2E AUDIT (headed, browser terlihat).
 *
 * Menjalankan flow kiosk NYATA sampai layar editor, lalu menguji SETIAP fitur
 * K10 + audit UI/UX (overlap, overflow, tap target, kontras, keyboard, state):
 *   filter preset (global), putar, Penyesuaian (zoom/brightness/kontras/
 *   saturasi/blur/grain/vignette), sticker picker (search + fallback),
 *   tambah teks, edit overlay (warna/ukuran/rotasi/posisi/drag/hapus),
 *   zoom/pan canvas, ganti foto (multi-slot), Selesai -> finalize -> hasil.
 *
 * 2 mode template:
 *   A) "Tanpa frame" (default)   -> layout null, frame null (render per-foto)
 *   B) E2E_K10_FRAME=1           -> template ber-layout (composeFrame + slot)
 *
 * Prasyarat: dev server live + kode aktivasi (mint: node .e2e-tmp/mint-code.mjs).
 *
 * Jalankan:
 *   E2E_K10=1 E2E_BASE=http://localhost:3000 \
 *   E2E_BUSINESS_SLUG=klik-foto-dev E2E_PHOTOBOX_SLUG=booth-02 \
 *   E2E_ACTIVATION_CODE=<6 digit> node tests/e2e/k10-editor-audit.mjs
 */

import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENABLED = process.env.E2E_K10 === "1";
const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const BUSINESS = process.env.E2E_BUSINESS_SLUG ?? "";
const PHOTOBOX = process.env.E2E_PHOTOBOX_SLUG ?? "";
const CODE = process.env.E2E_ACTIVATION_CODE ?? "";
const SETUP_KEY = `snapyos_device_setup_done:${PHOTOBOX}`;
const FRAME_MODE = process.env.E2E_K10_FRAME === "1";
const TAG = process.env.E2E_K10_TAG ?? "k10a";
const SHOT = (n) => `tests/e2e/${TAG}-${n}.png`;

if (!ENABLED) {
  console.log("SKIP: set E2E_K10=1 + booth env (lihat header).");
  process.exit(0);
}
if (!BUSINESS || !PHOTOBOX || !CODE) {
  console.error("FAIL: E2E_BUSINESS_SLUG, E2E_PHOTOBOX_SLUG, E2E_ACTIVATION_CODE wajib diisi");
  process.exit(1);
}

const userDataDir = mkdtempSync(join(tmpdir(), "snapyos-k10a-"));
const launchOpts = {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--no-first-run",
    "--no-default-browser-check",
  ],
};
if (process.env.E2E_BROWSER !== "chromium") launchOpts.channel = "chrome";
const browser = await chromium.launchPersistentContext(userDataDir, launchOpts);
console.log(`[mode] template: ${FRAME_MODE ? "BER-LAYOUT (frame + slot)" : "Tanpa frame (per-foto)"} | tag: ${TAG}`);

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
const isEditor = () => page.evaluate(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText));
const sleep = (ms) => page.waitForTimeout(ms);

/** Overlap report: pasangan elemen interaktif/teks yang saling menimpa. */
async function overlapReport() {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll("button, a, [role=button], h1, h2, p, img, video, canvas, input")]
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

/** Tap target audit: elemen interaktif < 44px (R-03 / WCAG 2.5.5). */
async function smallTargets() {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, a[href], input[type=range], [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.top > innerHeight) continue;
      if (r.width < 44 || r.height < 44) {
        out.push({
          tag: el.tagName,
          label: (el.innerText || el.getAttribute("aria-label") || el.className || "").slice(0, 34).replace(/\s+/g, " "),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    return out.slice(0, 20);
  });
}

/** Kontras teks vs background (WCAG AA: 4.5 normal, 3.0 large >=18.66px bold / 24px). */
async function contrastIssues() {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map((v) => parseFloat(v));
      return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const blend = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.05) return c;
        n = n.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const out = [];
    for (const el of document.querySelectorAll("p, span, h1, h2, h3, button, label, dt, dd, a")) {
      if (!el.innerText || !el.innerText.trim()) continue;
      if (el.children.length > 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const fgSolid = fg.a < 1 ? blend(fg, bg) : fg;
      const L1 = lum(fgSolid), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need) {
        out.push({
          text: el.innerText.slice(0, 28).replace(/\s+/g, " "),
          ratio: Math.round(ratio * 100) / 100,
          need,
          size: Math.round(size),
        });
      }
    }
    return out.slice(0, 15);
  });
}

/** Canvas editor -> ukuran + hash pixel + mean brightness (deteksi render berubah). */
async function canvasInfo() {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const ctx = c.getContext("2d");
    // Sampel SELURUH canvas (stride 7px) — overlay digambar di tengah, bukan pojok.
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    let hash = 0, sum = 0, n = 0;
    const stride = 4 * 7;
    for (let i = 0; i < img.length; i += stride) {
      hash = (hash * 31 + img[i] + img[i + 1] * 3 + img[i + 2] * 7) >>> 0;
      sum += (img[i] + img[i + 1] + img[i + 2]) / 3;
      n++;
    }
    return { w: c.width, h: c.height, hash, mean: Math.round(sum / Math.max(1, n)) };
  });
}

/** Canvas preview frame di layar capture (bukan canvas editor). */
async function capturePreviewInfo() {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-label^="Preview frame"]');
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0, sum = 0, n = 0, opaque = 0;
    for (let i = 0; i < img.length; i += 4 * 7) {
      hash = (hash * 31 + img[i] + img[i + 1] * 3 + img[i + 2] * 7) >>> 0;
      sum += (img[i] + img[i + 1] + img[i + 2]) / 3;
      if (img[i + 3] > 200) opaque++;
      n++;
    }
    return {
      w: canvas.width, h: canvas.height, hash,
      mean: Math.round(sum / Math.max(1, n)),
      opaquePct: Math.round((opaque / Math.max(1, n)) * 100),
      label: canvas.getAttribute("aria-label"),
    };
  });
}

/** Set slider React (native setter) lalu dispatch input+change. */
async function setRange(locator, value) {
  await locator.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function gotoEditor() {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((k) => localStorage.setItem(k, "1"), SETUP_KEY);
  await page.evaluate(() => localStorage.removeItem("snapyos_device_token"));
  const actRes = await page.request.post(`${BASE}/api/v1/public/devices/activate`, { data: { code: CODE } });
  const actJson = await actRes.json().catch(() => null);
  const token = actJson?.data?.device_token ?? null;
  if (!token) throw new Error("aktivasi gagal: " + JSON.stringify(actJson));
  await page.evaluate((t) => localStorage.setItem("snapyos_device_token", t), token);

  await page.goto(`${BASE}/p/${BUSINESS}/${PHOTOBOX}`, { waitUntil: "domcontentloaded" });
  await sleep(2500);

  const body = () => text();
  const step = async (n) => console.log(`  [flow] ${n} :: ${(await body()).replace(/\n+/g, " | ").slice(0, 120)}`);
  if (/MULAI|Mulai/i.test(await body())) {
    const start = page.locator("button").filter({ hasText: /Mulai/i }).first();
    if (await start.count()) { await start.click(); await sleep(1800); }
  }

  if (/PILIH PAKET/i.test(await body()) && !/PILIH FRAME/i.test(await body())) {
    const pick = page.locator("button").filter({ hasText: /Strip Klasik/i }).first();
    if (await pick.count()) { await pick.click(); await sleep(2500); }
  }

  // Checkout: ringkasan dimuat async, jadi tunggu tombol offline muncul dulu.
  // Mode offline owner-enabled (business_settings.checkout.offline_enabled)
  // membebaskan booth dari QRIS — dipakai fixture E2E.
  await page.waitForFunction(
    () =>
      /Lanjut offline/i.test(document.body.innerText) ||
      /PILIH FRAME|CAPTURE|Ambil foto|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
    null, { timeout: 20000 }
  ).catch(() => {});
  const offlineBtn = page.getByRole("button", { name: /Lanjut offline/i }).first();
  if (await offlineBtn.count()) {
    await offlineBtn.click();
    await sleep(3000);
    record("Checkout: lanjut offline (bypass QRIS)", true);
  }

  await page.waitForFunction(
    () => /PILIH FRAME|CAPTURE|Ambil foto|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
    null, { timeout: 20000 }
  ).catch(() => {});
  if (/PILIH FRAME/i.test(await body())) {
    await page.waitForFunction(() => !/Memuat\.\.\./.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    await sleep(800);
    await page.screenshot({ path: SHOT("01-template") });
    if (FRAME_MODE) {
      // Frame asli (slot terisi) ditandai badge "{n} FOTO" — pilih yang itu,
      // bukan template legacy tanpa layout.
      const slotBadged = page.locator("button").filter({ hasText: /\d+ FOTO/ });
      const frameBtns = (await slotBadged.count())
        ? slotBadged
        : page.locator("button[aria-pressed]").filter({ hasNotText: /Tanpa frame/i });
      if (await frameBtns.count()) {
        const names = await page.locator("button").filter({ hasText: /\d+ FOTO/ }).allInnerTexts();
        await frameBtns.first().click();
        record("Pilih template ber-layout", true, `frame asli: ${names.map((n) => n.replace(/\s+/g, " ")).join(" | ").slice(0, 80)}`);
      } else { const nf = page.locator('button:has-text("Tanpa frame")').first(); if (await nf.count()) await nf.click(); record("Pilih template ber-layout", false, "tidak ada frame"); }
    } else {
      const noFrame = page.locator('button:has-text("Tanpa frame")').first();
      if (await noFrame.count()) await noFrame.click();
    }
    await sleep(1200);
    const useBtn = page.getByRole("button", { name: /Gunakan frame|Lanjut|Mulai foto/i }).first();
    if (await useBtn.count()) await useBtn.click();
  }

  await page.waitForFunction(
    () => /CAPTURE|Ambil foto|Menyiapkan kamera|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
    null, { timeout: 25000 }
  ).catch(() => {});
  // Tunggu kamera siap (label tombol berubah dari "Menyiapkan kamera" -> "Ambil foto N/M").
  await page.waitForFunction(
    () => /Ambil foto \d+\/\d+/i.test(document.body.innerText) || /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
    null, { timeout: 30000 }
  ).catch(() => {});
  let guard = 0;
  let previewChecked = false;
  while (guard++ < 10) {
    if (await isEditor()) { await step(`editor reached @iter ${guard}`); break; }
    const b = await text();
    await step(`iter ${guard}`);
    if (!/Ambil foto/i.test(b)) { console.log("  [flow] break: no 'Ambil foto' in body"); break; }

    // Preview frame langsung (kamera kiri, frame kanan) — hanya bila layout ada.
    if (FRAME_MODE && !previewChecked) {
      previewChecked = true;
      await sleep(900);
      const cp = await capturePreviewInfo();
      record("Capture: preview frame tampil (slot + kamera)", Boolean(cp && cp.w > 0 && cp.h > 0), JSON.stringify(cp));
      record("Capture: layout dua panel (kamera kiri, frame kanan)", await page.evaluate(() => {
        const canvas = document.querySelector('canvas[aria-label^="Preview frame"]');
        const video = document.querySelector("video");
        if (!canvas || !video) return false;
        const c = canvas.getBoundingClientRect(), v = video.getBoundingClientRect();
        return v.left + v.width / 2 < c.left + c.width / 2;
      }));
      const ovr = await overlapReport();
      record("Capture: preview frame tidak tumpang-tindih", ovr.length === 0, JSON.stringify(ovr));
      const sm = await smallTargets();
      record("Capture: tap target >= 44px", sm.length === 0, JSON.stringify(sm.slice(0, 5)));
      await page.screenshot({ path: SHOT("00-capture-preview") });
    }

    const shoot = page.getByRole("button", { name: /Ambil foto|Menyiapkan kamera/i }).first();
    if ((await shoot.count()) && (await shoot.isEnabled().catch(() => false))) await shoot.click();
    await page.waitForFunction(
      () => /Foto berhasil diambil|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
      null, { timeout: 16000 }
    ).catch(() => {});
    if (await isEditor()) break;
    // Preview frame harus tetap ada saat review, memuat hasil slot ini.
    if (FRAME_MODE) {
      const review = await capturePreviewInfo();
      record(`Capture: preview frame saat review slot ${guard}`, Boolean(review && review.hash !== 0),
        JSON.stringify(review));
    }
    const next = page.getByRole("button", { name: /Lanjut edit|^Lanjut$/i }).first();
    console.log(`  [flow] next count=${await next.count()}`);
    if (await next.count()) { await next.click(); await sleep(1500); }
  }
  await page.waitForFunction(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText), null, { timeout: 20000 });
}

try {
  await gotoEditor();
  await sleep(1500);
  record("Flow kiosk -> layar editor", await isEditor(), (await text()).slice(0, 90).replace(/\s+/g, " "));
  await page.screenshot({ path: SHOT("02-editor-open") });

  // ============ A. Struktur & UI/UX ============
  const photoBtns = page.locator('button[aria-label^="Foto "]');
  const photoCount = await photoBtns.count();
  record("Tombol pemilih foto (multi-slot)", photoCount >= 1, `${photoCount} tombol`);

  let ov = await overlapReport();
  record("Editor: tidak ada elemen tumpang-tindih (desktop)", ov.length === 0, JSON.stringify(ov));
  let m = await metrics();
  record("Editor: tidak ada overflow horizontal (desktop)", m.scrollW <= m.clientW + 1, JSON.stringify(m));

  const small = await smallTargets();
  record("Editor: semua tap target >= 44px (desktop)", small.length === 0, JSON.stringify(small.slice(0, 6)));

  const contrast = await contrastIssues();
  record("Editor: kontras teks WCAG AA", contrast.length === 0, JSON.stringify(contrast.slice(0, 6)));

  const c0 = await canvasInfo();
  record("Canvas editor ter-render (foto tampil)", Boolean(c0 && c0.w > 0 && c0.h > 0), JSON.stringify(c0));

  // ============ B. Filter preset (global) ============
  const filterBtns = page.locator("button").filter({ hasText: /^(Original|Film|Warm|Cool|B&W|Retro|Vintage|Y2K)$/ });
  const fCount = await filterBtns.count();
  record("Filter preset tersedia (8)", fCount === 8, `${fCount} tombol`);
  if (fCount > 0) {
    const beforeFilter = await canvasInfo();
    await filterBtns.nth(1).click();
    await sleep(700);
    const afterFilter = await canvasInfo();
    const pressed = await filterBtns.nth(1).getAttribute("aria-pressed");
    record("Filter preset global mengubah preview", beforeFilter.hash !== afterFilter.hash && pressed === "true",
      `hash ${beforeFilter.hash}->${afterFilter.hash} pressed=${pressed}`);
    // filter GLOBAL: pindah foto lain tetap terpakai
    if (photoCount > 1) {
      await photoBtns.nth(1).click(); await sleep(600);
      const p2 = await filterBtns.nth(1).getAttribute("aria-pressed");
      record("Filter global berlaku antar-foto", p2 === "true", `aria-pressed=${p2}`);
      await photoBtns.nth(0).click(); await sleep(500);
    }
    await page.screenshot({ path: SHOT("03-filter") });
  }

  // ============ C. Rotasi ============
  const rotBtns = page.locator("button").filter({ hasText: /^\d+°$/ });
  const rCount = await rotBtns.count();
  record("Tombol rotasi 0/90/180/270 tersedia", rCount === 4, `${rCount} tombol`);
  if (rCount >= 4) {
    const beforeRot = await canvasInfo();
    await rotBtns.nth(1).click();
    await sleep(800);
    const afterRot = await canvasInfo();
    record("Rotasi 90° mengubah canvas",
      beforeRot.w !== afterRot.w || beforeRot.h !== afterRot.h || beforeRot.hash !== afterRot.hash,
      `dims ${beforeRot.w}x${beforeRot.h} -> ${afterRot.w}x${afterRot.h}`);
    await page.screenshot({ path: SHOT("04-rotate") });
    await rotBtns.nth(0).click();
    await sleep(400);
  }

  // ============ D. Penyesuaian (adjust) ============
  const adjustLabels = ["Zoom foto", "Kecerahan", "Kontras", "Saturasi", "Blur", "Grain", "Vignette"];
  const found = {};
  for (const l of adjustLabels) found[l] = await page.locator(`input[aria-label="${l}"]`).count();
  record("Kontrol Penyesuaian lengkap (7 slider)", Object.values(found).every((c) => c === 1), JSON.stringify(found));

  // D1. brightness
  const brightness = page.locator('input[aria-label="Kecerahan"]');
  if (await brightness.count()) {
    const before = await canvasInfo();
    await setRange(brightness, 1.5);
    await sleep(600);
    const after = await canvasInfo();
    record("Kecerahan mengubah render canvas", before.hash !== after.hash,
      `mean ${before.mean}->${after.mean} hash ${before.hash}->${after.hash}`);
    await setRange(brightness, 1);
    await sleep(300);
  }
  // D2. kontras
  const contrastEl = page.locator('input[aria-label="Kontras"]');
  if (await contrastEl.count()) {
    const before = await canvasInfo();
    await setRange(contrastEl, 1.5);
    await sleep(600);
    const after = await canvasInfo();
    record("Kontras mengubah render canvas", before.hash !== after.hash, `hash ${before.hash}->${after.hash}`);
    await setRange(contrastEl, 1);
    await sleep(300);
  }
  // D3. saturasi
  const satEl = page.locator('input[aria-label="Saturasi"]');
  if (await satEl.count()) {
    const before = await canvasInfo();
    await setRange(satEl, 0);
    await sleep(600);
    const after = await canvasInfo();
    record("Saturasi 0 (grayscale) mengubah render", before.hash !== after.hash, `hash ${before.hash}->${after.hash}`);
    await setRange(satEl, 1);
    await sleep(300);
  }
  // D4. blur
  const blurEl = page.locator('input[aria-label="Blur"]');
  if (await blurEl.count()) {
    const before = await canvasInfo();
    await setRange(blurEl, 8);
    await sleep(700);
    const after = await canvasInfo();
    record("Blur mengubah render canvas", before.hash !== after.hash, `hash ${before.hash}->${after.hash}`);
    await setRange(blurEl, 0);
    await sleep(300);
  }
  // D5. grain
  const grainEl = page.locator('input[aria-label="Grain"]');
  if (await grainEl.count()) {
    const before = await canvasInfo();
    await setRange(grainEl, 0.8);
    await sleep(700);
    const after = await canvasInfo();
    record("Grain mengubah render canvas", before.hash !== after.hash, `hash ${before.hash}->${after.hash}`);
    await setRange(grainEl, 0);
    await sleep(300);
  }
  // D6. vignette
  const vigEl = page.locator('input[aria-label="Vignette"]');
  if (await vigEl.count()) {
    const before = await canvasInfo();
    await setRange(vigEl, 0.8);
    await sleep(700);
    const after = await canvasInfo();
    record("Vignette mengubah render canvas", before.hash !== after.hash, `hash ${before.hash}->${after.hash}`);
    await page.screenshot({ path: SHOT("05-adjust") });
    await setRange(vigEl, 0);
    await sleep(300);
  }

  // ============ E. Zoom slider ============
  const zoomEl = page.locator('input[aria-label="Zoom foto"]');
  if (await zoomEl.count()) {
    const before = await canvasInfo();
    await setRange(zoomEl, 2);
    await sleep(700);
    const after = await canvasInfo();
    const cursor = await page.locator("canvas").first().evaluate((el) => getComputedStyle(el).cursor);
    record("Zoom slider mengubah render + cursor grab", before.hash !== after.hash && cursor === "grab",
      `hash ${before.hash}->${after.hash} cursor=${cursor}`);
    await setRange(zoomEl, 1);
    await sleep(400);
  }

  // ============ F. Sticker picker ============
  const stickerSection = page.locator("p", { hasText: /^Stiker$/ }).first();
  record("Bagian Stiker tampil", (await stickerSection.count()) > 0);
  await sleep(2500);
  const stickerBtns = page.locator('div.max-h-\\[180px\\] button');
  const sCount = await stickerBtns.count();
  record("Sticker picker punya item (API/fallback)", sCount > 0, `${sCount} stiker`);
  const fallbackNote = await page.locator("text=Emoji dasar (API offline)").count();
  if (fallbackNote > 0) console.log("  [info] emoji API offline -> memakai fallback glyphs");
  if (sCount > 0) {
    await stickerBtns.first().click();
    await sleep(800);
    const hasStickerPanel = await page.locator("p", { hasText: /UBAH STIKER/i }).count();
    record("Klik stiker -> panel UBAH STIKER muncul", hasStickerPanel > 0);
    await page.screenshot({ path: SHOT("06-sticker") });
  }

  // ============ G. Tambah teks + edit overlay ============
  const textInput = page.locator('input[placeholder="Tulis teks…"]');
  record("Input teks tersedia", (await textInput.count()) > 0);
  if (await textInput.count()) {
    await textInput.fill("SNAPY OS");
    await page.getByRole("button", { name: /Tambah teks/i }).first().click();
    await sleep(700);
    const hasTextPanel = await page.locator("p", { hasText: /UBAH TEKS/i }).count();
    record("Tambah teks -> panel UBAH TEKS muncul", hasTextPanel > 0);

    // G1. warna
    const colorBtns = page.locator('button[aria-label^="Warna "]');
    const cc = await colorBtns.count();
    record("Pilihan warna teks tersedia", cc > 0, `${cc} warna`);
    if (cc > 1) {
      const beforeColor = await canvasInfo();
      await colorBtns.nth(2).click(); await sleep(600);
      const afterColor = await canvasInfo();
      record("Ganti warna teks mengubah render", beforeColor.hash !== afterColor.hash, `hash ${beforeColor.hash}->${afterColor.hash}`);
    }
    // G2. ukuran + rotasi overlay
    const ranges = page.locator('input[type="range"]');
    const rc = await ranges.count();
    const sizeRange = page.locator('input[type="range"]').filter({ hasNot: page.locator("xpath=.") });
    const overlaySliders = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("label span")].map((s) => s.textContent || "");
      return labels.filter((t) => /Ukuran|Rotasi —/.test(t)).length;
    });
    record("Slider ukuran & rotasi overlay ada", overlaySliders >= 2, `${overlaySliders} label slider (total range=${rc})`);
    if (overlaySliders >= 2) {
      const beforeSize = await canvasInfo();
      const ukuran = page.locator('label:has-text("Ukuran") input[type="range"]').first();
      await setRange(ukuran, 0.35); await sleep(500);
      const rotasi = page.locator('label:has-text("Rotasi") input[type="range"]').first();
      await setRange(rotasi, 90); await sleep(600);
      const afterSize = await canvasInfo();
      record("Ukuran+rotasi overlay mengubah render", beforeSize.hash !== afterSize.hash, `hash ${beforeSize.hash}->${afterSize.hash}`);
    }
    // G3. posisi
    const posAtas = page.getByRole("button", { name: /^Atas$/ }).first();
    record("Tombol posisi overlay (Atas/Tengah/Bawah)", (await posAtas.count()) > 0);
    if (await posAtas.count()) {
      const beforePos = await canvasInfo();
      await posAtas.click(); await sleep(600);
      const afterPos = await canvasInfo();
      record("Pindah posisi overlay mengubah render", beforePos.hash !== afterPos.hash, `hash ${beforePos.hash}->${afterPos.hash}`);
    }
    await page.screenshot({ path: SHOT("07-text-overlay") });
  }

  // ============ H. Drag overlay di canvas ============
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const beforeDrag = await canvasInfo();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 8 });
    await page.mouse.up();
    await sleep(600);
    const afterDrag = await canvasInfo();
    record("Drag overlay di canvas menggeser (render berubah)", beforeDrag.hash !== afterDrag.hash,
      `hash ${beforeDrag.hash}->${afterDrag.hash}`);
    await page.screenshot({ path: SHOT("08-drag") });
  }

  // ============ I. Hapus overlay ============
  const delBtn = page.getByRole("button", { name: /Hapus/i }).first();
  if (await delBtn.count()) {
    await delBtn.click();
    await sleep(600);
    record("Hapus overlay berfungsi (panel tertutup)", (await page.locator("p", { hasText: /UBAH /i }).count()) === 0);
  } else {
    record("Tombol Hapus overlay tersedia", false);
  }

  // ============ J. Keyboard accessibility (R-32) ============
  await page.keyboard.press("Tab");
  const focusInfo = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      label: (el.innerText || el.getAttribute("aria-label") || "").slice(0, 24).replace(/\s+/g, " "),
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
    };
  });
  record("Keyboard: Tab memberi focus indicator", Boolean(focusInfo && focusInfo.outline && focusInfo.outline !== "none 0px"),
    JSON.stringify(focusInfo));

  // ============ K. Overlap/overflow final sebelum finish ============
  ov = await overlapReport();
  record("Editor (setelah interaksi): tidak ada tumpang-tindih", ov.length === 0, JSON.stringify(ov));
  m = await metrics();
  record("Editor (setelah interaksi): tidak ada overflow", m.scrollW <= m.clientW + 1, JSON.stringify(m));

  // ============ L. Responsive: tablet + phone ============
  for (const [name, vp] of [["tablet", { width: 1024, height: 768 }], ["phone", { width: 390, height: 844 }]]) {
    await page.setViewportSize(vp);
    await sleep(800);
    const ovr = await overlapReport();
    const mm = await metrics();
    const sm = await smallTargets();
    record(`Responsif ${name}: tidak overflow`, mm.scrollW <= mm.clientW + 1, JSON.stringify(mm));
    record(`Responsif ${name}: tidak tumpang-tindih`, ovr.length === 0, JSON.stringify(ovr));
    record(`Responsif ${name}: tap target >= 44px`, sm.length === 0, JSON.stringify(sm.slice(0, 5)));
    await page.screenshot({ path: SHOT(`09-${name}`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(600);

  // ============ M. Selesaikan (finalize) ============
  const finishBtn = page.getByRole("button", { name: /Selesai|Menyimpan/i }).first();
  record("Tombol Selesai tersedia", (await finishBtn.count()) > 0);
  if (await finishBtn.count()) {
    const finishResp = [];
    page.on("response", (r) => { if (/finalize/.test(r.url())) finishResp.push(`${r.status()} ${r.url().split("/").pop()}`); });
    await finishBtn.click();
    await sleep(7000);
    const b = await text();
    const leftEditor = !/EDIT FOTO|LANGKAH 03/i.test(b);
    record("Selesai -> keluar dari editor (finalize)", leftEditor, b.slice(0, 110).replace(/\s+/g, " "));
    record("POST finalize terpanggil", finishResp.length > 0, finishResp.join(" | "));
    const reachedResult = /Hasil|Simpan|Unduh|QR|Cetak|Selesai|Terima kasih|Result|print/i.test(b);
    record("Layar hasil/print tampil setelah finalize", reachedResult, b.slice(0, 110).replace(/\s+/g, " "));
    await page.screenshot({ path: SHOT("10-after-finish") });
    // Print screen -> lanjut -> result
    const printNext = page.getByRole("button", { name: /^Lanjut$|Selesai cetak|Lanjut ke hasil/i }).first();
    if (await printNext.count()) {
      await printNext.click();
      await sleep(2500);
      await page.screenshot({ path: SHOT("11-result") });
      record("Layar hasil akhir tampil", /Hasil|Unduh|QR|Selesai|Terima kasih/i.test(await text()), (await text()).slice(0, 110).replace(/\s+/g, " "));
    }
  }
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
  console.log(`\n=== K10 EDITOR AUDIT [${TAG}] ${FRAME_MODE ? "FRAME" : "NO-FRAME"}: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) console.log("FAILED:\n" + failed.map((f) => ` - ${f.name} :: ${f.detail}`).join("\n"));
  process.exit(failed.length ? 1 : 0);
}
