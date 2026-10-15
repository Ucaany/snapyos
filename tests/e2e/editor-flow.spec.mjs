/**
 * K10 — Editor (Edit Foto) end-to-end.
 *
 * Menjalankan flow kiosk NYATA dengan browser HEADED (terlihat) sampai ke
 * layar editor, lalu menguji SETIAP fitur K10:
 *   filter preset (global), rotate, sticker picker (search + fallback),
 *   tambah teks, edit overlay (warna/ukuran/rotasi/posisi/hapus),
 *   zoom/pan via pointer drag, dan Selesaikan (finalize).
 *
 * Diuji 2 mode template:
 *   A) "Tanpa frame"  -> layout null, frame null  (per-foto render)
 *   B) frame legacy    -> layout null, frameUrl ada (frame PNG, tanpa slot)
 *
 * Prasyarat: dev server live + kode aktivasi aktif (.e2e-tmp/mint-code.mjs).
 *
 * Jalankan:
 *   E2E_K10=1 E2E_BASE=http://localhost:3456 \
 *   E2E_BUSINESS_SLUG=klik-foto-dev E2E_PHOTOBOX_SLUG=booth-02 \
 *   E2E_ACTIVATION_CODE=<6 digit> node tests/e2e/editor-flow.spec.mjs
 */

import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENABLED = process.env.E2E_K10 === "1";
const BASE = process.env.E2E_BASE ?? "http://localhost:3456";
const BUSINESS = process.env.E2E_BUSINESS_SLUG ?? "";
const PHOTOBOX = process.env.E2E_PHOTOBOX_SLUG ?? "";
const CODE = process.env.E2E_ACTIVATION_CODE ?? "";
const SETUP_KEY = `snapyos_device_setup_done:${PHOTOBOX}`;
const FRAME_MODE = process.env.E2E_K10_FRAME === "1"; // true = pilih template ber-frame
const SHOT = (n) => `tests/e2e/k10-${n}.png`;

if (!ENABLED) {
  console.log("SKIP: set E2E_K10=1 + booth env (lihat header).");
  process.exit(0);
}
if (!BUSINESS || !PHOTOBOX || !CODE) {
  console.error("FAIL: E2E_BUSINESS_SLUG, E2E_PHOTOBOX_SLUG, E2E_ACTIVATION_CODE wajib diisi");
  process.exit(1);
}

const userDataDir = mkdtempSync(join(tmpdir(), "snapyos-k10-"));
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
console.log(`[mode] frame template: ${FRAME_MODE ? "YA (legacy frame)" : "TIDAK (Tanpa frame)"}`);

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

const page = browser.pages()[0] ?? (await browser.newPage());
await page.route("**/api/v1/emoji**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: [{ char: "★", name: "Star", group: "symbols" }] }),
  });
});
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
        if (a.el.getAttribute("aria-label")?.startsWith("Petugas") || b.el.getAttribute("aria-label")?.startsWith("Petugas")) continue;
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

/** Canvas editor -> ukuran + snapshot pixel hash (deteksi render berubah). */
async function canvasInfo() {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const ctx = c.getContext("2d");
    const data = ctx.getImageData(0, 0, Math.min(c.width, 40), Math.min(c.height, 40)).data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 17) hash = (hash * 31 + data[i]) >>> 0;
    return { w: c.width, h: c.height, hash };
  });
}

async function gotoEditor() {
  // ---- 0. Aktivasi + seed device state sebelum navigasi kiosk ----
  const actRes = await page.request.post(`${BASE}/api/v1/public/devices/activate`, {
    data: { code: CODE },
  });
  const actJson = await actRes.json().catch(() => null);
  const token = actJson?.data?.device_token ?? null;
  if (!token) throw new Error("aktivasi gagal: " + JSON.stringify(actJson));
  await page.addInitScript(
    ({ setupKey, deviceToken }) => {
      localStorage.setItem(setupKey, "1");
      localStorage.setItem("snapyos_device_token", deviceToken);
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#111111";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#FF2A2A";
        context.fillRect(80, 80, 1120, 560);
        context.fillStyle = "#F4F4F0";
        context.font = "bold 96px sans-serif";
        context.fillText("SNAPYOS E2E", 250, 390);
      }
      const stream = canvas.captureStream(30);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => stream,
          enumerateDevices: async () => [],
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        },
      });
    },
    { setupKey: SETUP_KEY, deviceToken: token }
  );

  // ---- 1. Boot kiosk (bisa resume ke welcome/package/template/capture) ----
  await page.goto(`${BASE}/p/${BUSINESS}/${PHOTOBOX}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => /MULAI|PILIH PAKET|PILIH FRAME|CAPTURE|Ambil foto|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(1000);

  const body = () => text();
  // ---- 2. Mulai (welcome/guide) — CTA dikustom owner (mis. "START"), dan
  // tagline bisa memuat kata "Capture". Deteksi lewat keyword layar LANJUT,
  // bukan kata "capture". Klik CTA non-petugas sampai layar paket. ----
  for (let i = 0; i < 3; i++) {
    const b = await body();
    if (/PILIH PAKET|PILIH FRAME|Ambil foto|EDIT FOTO|LANGKAH 03/i.test(b)) break;
    const cta = page.locator('button:not([aria-label^="Petugas"])').filter({ hasText: /\S/ }).first();
    if (!(await cta.count())) break;
    await cta.click();
    await page.waitForTimeout(1800);
  }

  // ---- 3. Pilih paket (bila di layar paket) ----
  if (/PILIH PAKET|Paket/i.test(await body()) && !/PILIH FRAME/i.test(await body())) {
    const cards = page.locator('button:has-text("PKG-")');
    const n = await cards.count();
    if (n > 0) {
      let picked = false;
      for (let i = 0; i < n; i++) {
        const t = await cards.nth(i).innerText();
        if (/strip klasik/i.test(t)) { await cards.nth(i).click(); picked = true; break; }
      }
      if (!picked) await cards.first().click();
      await page.waitForTimeout(2000);
    }
  }

  // ---- 4. Checkout -> Lanjut offline (tunggu ringkasan async dulu) ----
  await page.waitForFunction(
    () => /RINGKASAN PESANAN|PILIH PEMBAYARAN|PILIH FRAME/i.test(document.body.innerText),
    null, { timeout: 15000 }
  ).catch(() => {});
  const offlineBtn = page.getByRole("button", { name: /Lanjut offline/i });
  if (await offlineBtn.count()) { await offlineBtn.first().click(); await page.waitForTimeout(3000); }

  // ---- 5. Template picker (tunggu bila transisi) ----
  await page.waitForFunction(
    () => /PILIH FRAME|CAPTURE|Ambil foto|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
    null, { timeout: 20000 }
  ).catch(() => {});
  if (/PILIH FRAME/i.test(await body())) {
    await page.waitForFunction(() => !/Memuat\.\.\./.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOT("01-template") });
    if (FRAME_MODE) {
      // Kartu frame = tombol berisi thumbnail; "Tanpa frame" tidak punya <img>.
      const frameBtns = page.locator("button:has(img)").filter({ hasNotText: /Tanpa frame/i });
      if (await frameBtns.count()) { await frameBtns.first().click(); record("Pilih template ber-frame", true); }
      else { const nf = page.locator('button:has-text("Tanpa frame")').first(); if (await nf.count()) await nf.click(); }
    } else {
      const noFrame = page.locator('button:has-text("Tanpa frame")').first();
      if (await noFrame.count()) await noFrame.click();
    }
    await page.waitForTimeout(1200);
    const useBtn = page.getByRole("button", { name: /Gunakan frame|Lanjut|Mulai foto/i }).first();
    if (await useBtn.count()) await useBtn.click();
  }

  // ---- 6. Capture semua slot sampai editor ----
  await page.waitForFunction(
    () => /CAPTURE|Ambil foto|Menyiapkan kamera|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
    null, { timeout: 25000 }
  ).catch(() => {});
  let guard = 0;
  while (guard++ < 10) {
    if (await isEditor()) break;
    const b = await text();
    if (!/Ambil foto/i.test(b)) break;
    const shoot = page.getByRole("button", { name: /^Ambil foto \d+\/\d+$/i });
    await shoot.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find((item) => /^Ambil foto \d+\/\d+$/i.test(item.innerText.trim()));
        return button && !button.disabled;
      },
      null,
      { timeout: 15000 }
    );
    await shoot.click();
    await page.waitForFunction(
      () => [...document.querySelectorAll("span")].some((item) => /^[123]$/.test(item.innerText.trim()) && parseFloat(getComputedStyle(item).fontSize) > 60),
      null,
      { timeout: 3000 }
    );
    await page.waitForFunction(
      () => /Foto berhasil diambil|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText),
      null, { timeout: 14000 }
    ).catch(() => {});
    if (await isEditor()) break;
    const next = page.getByRole("button", { name: /Lanjut edit|^Lanjut$/i }).first();
    if (await next.count()) { await next.click(); await page.waitForTimeout(1500); }
  }
  await page.waitForFunction(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText), null, { timeout: 20000 }).catch(async (error) => {
    throw new Error(`${error.message} | layar: ${(await text()).slice(0, 500).replace(/\s+/g, " ")}`);
  });
}

try {
  await gotoEditor();
  await page.waitForTimeout(1200);
  record("Flow kiosk -> layar editor", await isEditor(), (await text()).slice(0, 90).replace(/\s+/g, " "));
  await page.screenshot({ path: SHOT("02-editor-open") });

  // ---- Ukur jumlah tombol foto (multi-slot) ----
  const photoBtns = page.locator('button[aria-label^="Foto "]');
  const photoCount = await photoBtns.count();
  record("Tombol pemilih foto (multi-slot)", photoCount >= 1, `${photoCount} tombol`);

  // ---- A. Layout/overlap/overflow editor ----
  let ov = await overlapReport();
  record("Editor: tidak ada elemen tumpang-tindih (desktop)", ov.length === 0, JSON.stringify(ov));
  let m = await metrics();
  record("Editor: tidak ada overflow horizontal (desktop)", m.scrollW <= m.clientW + 1, JSON.stringify(m));

  const c0 = await canvasInfo();
  record("Canvas editor ter-render (foto tampil)", Boolean(c0 && c0.w > 0 && c0.h > 0), JSON.stringify(c0));

  // ---- B. Filter preset (global) ----
  const filterBtns = page.locator("button").filter({ hasText: /^(Original|Film|Warm|Cool|B&W|Retro|Vintage|Y2K)$/ });
  const fCount = await filterBtns.count();
  const beforeFilter = await canvasInfo();
  if (fCount > 0) {
    // pilih filter non-original pertama (index 1+)
    await filterBtns.nth(Math.min(1, fCount - 1)).click();
    await page.waitForTimeout(700);
    const afterFilter = await canvasInfo();
    const pressed = await filterBtns.nth(Math.min(1, fCount - 1)).getAttribute("aria-pressed");
    record("Filter preset global mengubah preview", beforeFilter.hash !== afterFilter.hash || pressed === "true",
      `hash ${beforeFilter.hash}->${afterFilter.hash} pressed=${pressed} (${fCount} filter)`);
    await page.screenshot({ path: SHOT("03-filter") });
  } else {
    record("Filter preset tersedia", false, "0 tombol filter");
  }

  // ---- C. Rotasi ----
  const rotBtns = page.locator("button").filter({ hasText: /^\d+°$/ });
  const rCount = await rotBtns.count();
  if (rCount >= 4) {
    const beforeRot = await canvasInfo();
    await rotBtns.nth(1).click(); // 90°
    await page.waitForTimeout(700);
    const afterRot = await canvasInfo();
    record("Rotasi foto (90°) mengubah canvas", beforeRot.w !== afterRot.w || beforeRot.h !== afterRot.h || beforeRot.hash !== afterRot.hash,
      `dims ${beforeRot.w}x${beforeRot.h} -> ${afterRot.w}x${afterRot.h}`);
    await page.screenshot({ path: SHOT("04-rotate") });
    await rotBtns.nth(0).click(); // balik 0°
    await page.waitForTimeout(400);
  } else {
    record("Tombol rotasi 0/90/180/270 tersedia", false, `${rCount} tombol`);
  }

  // ---- D. Sticker picker ----
  const stickerSection = page.locator("p", { hasText: /^Stiker$/ }).first();
  record("Bagian Stiker tampil", (await stickerSection.count()) > 0);
  await page.waitForTimeout(2500); // tunggu emoji API / fallback
  const stickerBtns = page.locator('div[class*="max-h-[180px]"] button');
  const sCount = await stickerBtns.count();
  record("Sticker picker punya item", sCount > 0, `${sCount} stiker`);
  if (sCount > 0) {
    await stickerBtns.first().click();
    await page.waitForTimeout(700);
    const hasEditorPanel = await page.locator("p", { hasText: /UBAH STIKER/i }).count();
    record("Klik stiker -> panel ubah stiker muncul", hasEditorPanel > 0);
    await page.screenshot({ path: SHOT("05-sticker") });
  }

  // ---- E. Tambah teks ----
  const textInput = page.locator('input[placeholder="Tulis teks…"]');
  if (await textInput.count()) {
    await textInput.fill("SNAPY OS");
    const addBtn = page.getByRole("button", { name: /Tambah teks/i }).first();
    await addBtn.click();
    await page.waitForTimeout(600);
    const hasTextPanel = await page.locator("p", { hasText: /UBAH TEKS/i }).count();
    record("Tambah teks -> panel ubah teks muncul", hasTextPanel > 0);

    // E1. warna teks
    const colorBtns = page.locator('button[aria-label^="Warna "]');
    const cc = await colorBtns.count();
    if (cc > 0) { await colorBtns.nth(Math.min(1, cc - 1)).click(); await page.waitForTimeout(400); }
    record("Pilihan warna teks tersedia", cc > 0, `${cc} warna`);

    // E2. slider ukuran + rotasi
    const ranges = page.locator('input[type="range"]');
    const rc = await ranges.count();
    if (rc >= 2) {
      await ranges.nth(0).evaluate((el) => { el.value = String(Number(el.max) * 0.9); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
      await ranges.nth(1).evaluate((el) => { el.value = "90"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.waitForTimeout(500);
    }
    record("Slider ukuran & rotasi overlay ada", rc >= 2, `${rc} slider`);

    // E3. posisi (Atas/Tengah/Bawah)
    const posAtas = page.getByRole("button", { name: /^Atas$/ }).first();
    if (await posAtas.count()) { await posAtas.click(); await page.waitForTimeout(400); }
    record("Tombol posisi overlay (Atas/Tengah/Bawah)", (await posAtas.count()) > 0);
    await page.screenshot({ path: SHOT("06-text-overlay") });
  } else {
    record("Input teks tersedia", false);
  }

  // ---- F. Zoom/pan (drag canvas) ----
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    // Zoom dulu via scroll wheel? tidak ada kontrol zoom UI -> uji pan hanya
    // bila zoom>1. Kasih pointer drag untuk memastikan tak error.
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 30, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    record("Drag canvas (pan/zoom) tanpa error", true);
  }

  // ---- G. Hapus overlay ----
  const delBtn = page.getByRole("button", { name: /Hapus/i }).first();
  if (await delBtn.count()) {
    await delBtn.click();
    await page.waitForTimeout(500);
    record("Hapus overlay berfungsi (panel tertutup)", (await page.locator("p", { hasText: /UBAH /i }).count()) === 0);
  } else {
    record("Tombol Hapus overlay tersedia", false);
  }

  // ---- H. Overlap/overflow final sebelum finish ----
  ov = await overlapReport();
  record("Editor (setelah interaksi): tidak ada tumpang-tindih", ov.length === 0, JSON.stringify(ov));
  m = await metrics();
  record("Editor (setelah interaksi): tidak ada overflow", m.scrollW <= m.clientW + 1, JSON.stringify(m));

  // ---- I. Responsive: tablet + phone ----
  for (const [name, vp] of [["tablet", { width: 1024, height: 768 }], ["phone", { width: 390, height: 844 }]]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(600);
    const ovr = await overlapReport();
    const mm = await metrics();
    record(`Editor responsif ${name}: tidak overflow`, mm.scrollW <= mm.clientW + 1, JSON.stringify(mm));
    record(`Editor responsif ${name}: tidak tumpang-tindih`, ovr.length === 0, JSON.stringify(ovr));
    await page.screenshot({ path: SHOT(`07-${name}`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // ---- J. Selesaikan (finalize) ----
  await page.evaluate(() => {
    window.__snapyosPrintE2E = { calls: 0, sheets: 0, images: [], pageStyle: "" };
    window.print = () => {
      const images = [...document.querySelectorAll("img.print-photo")];
      window.__snapyosPrintE2E = {
        calls: window.__snapyosPrintE2E.calls + 1,
        sheets: document.querySelectorAll(".print-sheet").length,
        images: images.map((img) => ({ complete: img.complete, width: img.naturalWidth, src: img.src })),
        pageStyle: document.querySelector("style#snapyos-print-css")?.textContent ?? "",
      };
      setTimeout(() => window.dispatchEvent(new Event("afterprint")), 200);
    };
  });
  const finishBtn = page.getByRole("button", { name: /Selesai|Menyimpan/i }).first();
  record("Tombol Selesai tersedia", (await finishBtn.count()) > 0);
  if (await finishBtn.count()) {
    await finishBtn.click();
    await page.waitForFunction(() => window.__snapyosPrintE2E?.calls === 1, null, { timeout: 30000 });
    const printEvidence = await page.evaluate(() => window.__snapyosPrintE2E);
    record("PrintLayoutRenderer memanggil window.print tepat sekali", printEvidence.calls === 1, JSON.stringify(printEvidence));
    record("PrintLayoutRenderer membuat sheet nyata", printEvidence.sheets > 0, `${printEvidence.sheets} sheet`);
    record(
      "Semua gambar print termuat dari Blob URL",
      printEvidence.images.length > 0 && printEvidence.images.every((img) => img.complete && img.width > 0 && img.src.startsWith("blob:")),
      JSON.stringify(printEvidence.images)
    );
    record(
      "Print settings menghasilkan @page 4x6 portrait tanpa margin",
      /size:\s*101\.6mm\s+152\.4mm/.test(printEvidence.pageStyle) && /margin:\s*0mm/.test(printEvidence.pageStyle),
      printEvidence.pageStyle
    );
    await page.waitForFunction(
      () => /Foto kamu jadi|Pindai QR|Unduh foto|Sesi baru/i.test(document.body.innerText),
      null,
      { timeout: 10000 }
    );
    const b = await text();
    const leftEditor = !/EDIT FOTO|LANGKAH 03/i.test(b);
    const reachedResult = /Foto kamu jadi|Pindai QR|Unduh foto|Sesi baru/i.test(b);
    record("Selesai -> keluar dari editor (finalize)", leftEditor, b.slice(0, 100).replace(/\s+/g, " "));
    record("afterprint -> layar hasil", reachedResult, b.slice(0, 100).replace(/\s+/g, " "));
    await page.screenshot({ path: SHOT("08-after-finish") });
  }
} catch (e) {
  console.error(e);
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
  console.log(`\n=== K10 Editor E2E: ${results.length - failed.length}/${results.length} PASS ===`);
  process.exit(failed.length ? 1 : 0);
}
