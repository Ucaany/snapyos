/**
 * K-FULL — Audit kiosk end-to-end: pembayaran (QRIS/voucher/tunai), frame,
 * capture → editor → finalize → print → QR result, dan link hasil kedaluwarsa.
 *
 * Menjalankan flow kiosk NYATA. Kamera default = fake device (deterministik).
 * E2E_REAL_CAM=1 memakai kamera asli (FaceTime/Continuity) — butuh izin kamera
 * OS untuk browser yang dipakai.
 *
 * Prasyarat: dev server live + kode aktivasi (mint .e2e-tmp/mint-code.mjs) +
 * voucher AUDITFREE (fixed, menutup penuh) di DB dev.
 *
 * Jalankan:
 *   E2E_FULL=1 E2E_BASE=http://localhost:3000 \
 *   E2E_BUSINESS_SLUG=klik-foto-dev E2E_PHOTOBOX_SLUG=booth-02 \
 *   E2E_ACTIVATION_CODE=<6 digit> node tests/e2e/kiosk-full.spec.mjs
 */

import { chromium } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ENABLED = process.env.E2E_FULL === "1";
const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
// Default booth dev agar `npm run test:e2e:full` jalan tanpa env tambahan.
const BUSINESS = process.env.E2E_BUSINESS_SLUG ?? "klik-foto-dev";
const PHOTOBOX = process.env.E2E_PHOTOBOX_SLUG ?? "booth-02";
let CODE = process.env.E2E_ACTIVATION_CODE ?? "";
const VOUCHER = process.env.E2E_VOUCHER_CODE ?? "AUDITFREE";
const REAL_CAM = process.env.E2E_REAL_CAM === "1";
const SETUP_KEY = `snapyos_device_setup_done:${PHOTOBOX}`;
const SHOT = (n) => `tests/e2e/kfull-${n}.png`;

if (!ENABLED) {
  console.log("SKIP: set E2E_FULL=1 (atau pakai `npm run test:e2e:full`).");
  process.exit(0);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("FAIL: .env.local wajib memuat SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (booth dev).");
  process.exit(1);
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Lookup booth → id + business_id, lalu auto-mint kode aktivasi bila belum
// diberikan (kode aktivasi sekali pakai; mint baru tiap run).
const { data: booth } = await sb
  .from("photoboxes")
  .select("id, business_id")
  .eq("slug", PHOTOBOX)
  .maybeSingle();
if (!booth?.id) {
  console.error(`FAIL: photobox slug "${PHOTOBOX}" tidak ditemukan di DB dev.`);
  process.exit(1);
}
const PHOTOBOX_ID = booth.id;
const BUSINESS_ID = booth.business_id;

async function mintActivationCode() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await sb.from("activation_codes").delete().eq("photobox_id", PHOTOBOX_ID).is("used_at", null);
  const { error } = await sb.from("activation_codes").insert({
    photobox_id: PHOTOBOX_ID,
    business_id: BUSINESS_ID,
    code,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(`mint kode aktivasi gagal: ${error.message}`);
  return code;
}
if (!CODE) {
  CODE = await mintActivationCode();
  console.log(`[setup] kode aktivasi di-mint otomatis: ${CODE}`);
}

const results = [];
const consoleErrors = [];
const pageErrors = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

const userDataDir = mkdtempSync(join(tmpdir(), "snapyos-kfull-"));
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
console.log(`[mode] kamera: ${REAL_CAM ? "ASLI" : "FAKE device"} | browser: ${process.env.E2E_BROWSER === "chromium" ? "Chromium" : "Chrome"}`);

const page = browser.pages()[0] ?? (await browser.newPage());
await browser.grantPermissions(["camera"], { origin: BASE }).catch(() => {});
page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  // Abaikan noise yang bukan bug aplikasi: favicon/404, blob URL StrictMode,
  // dan emoji-api 503 (EMOJI_API_KEY tak diset di dev → picker pakai fallback).
  if (
    m.type() === "error" &&
    !/favicon|\/404|favicon\.ico|net::ERR_FILE_NOT_FOUND|emoji|503|Service Unavailable/i.test(m.text())
  ) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});

const text = () => page.locator("body").innerText();
const sleep = (ms) => page.waitForTimeout(ms);

/** Reset booth: tutup sesi aktif + checkout terbuka. */
async function resetBooth() {
  const now = new Date().toISOString();
  await sb.from("sessions").update({ status: "expired", finalized_at: now }).eq("photobox_id", PHOTOBOX_ID).eq("status", "active");
  await sb.from("checkout_sessions").update({ status: "expired" }).eq("photobox_id", PHOTOBOX_ID).in("status", ["open", "pending"]);
}

/** Boot kiosk sampai layar pilih paket. */
async function toPackageScreen(token) {
  await page.goto(`${BASE}/p/${BUSINESS}/${PHOTOBOX}`, { waitUntil: "domcontentloaded" });
  await sleep(2200);
  for (let i = 0; i < 3; i++) {
    const b = await text();
    if (/PILIH PAKET|PILIH FRAME|Ambil foto|EDIT FOTO/i.test(b)) break;
    const cta = page.locator('button:not([aria-label^="Petugas"])').filter({ hasText: /\S/ }).first();
    if (!(await cta.count())) break;
    await cta.click();
    await sleep(1500);
  }
  await page.waitForFunction(() => /PILIH PAKET/i.test(document.body.innerText), null, { timeout: 15000 });
}

/** Pilih paket Strip Klasik (punya frame ber-slot). */
async function pickPackage() {
  const cards = page.locator('button[role="listitem"]');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    if (/strip klasik/i.test(await cards.nth(i).innerText())) { await cards.nth(i).click(); return; }
  }
  await cards.first().click();
}

/** Dari ringkasan checkout → pemilih metode. */
async function toMethodPicker() {
  await page.waitForFunction(() => /RINGKASAN PESANAN|PILIH PEMBAYARAN/i.test(document.body.innerText), null, { timeout: 15000 });
  const pick = page.getByRole("button", { name: /Pilih pembayaran/i }).first();
  if (await pick.count()) { await pick.click(); await sleep(800); }
  await page.waitForFunction(() => /PILIH PEMBAYARAN|PILIH METODE/i.test(document.body.innerText), null, { timeout: 8000 });
}

const isEditor = () => page.evaluate(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText));

try {
  await resetBooth();

  // ---- 0. Aktivasi ----
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((k) => localStorage.setItem(k, "1"), SETUP_KEY);
  const actRes = await page.request.post(`${BASE}/api/v1/public/devices/activate`, { data: { code: CODE } });
  const token = (await actRes.json().catch(() => null))?.data?.device_token ?? null;
  record("Aktivasi perangkat", Boolean(token), token ? "" : "no token");
  if (!token) throw new Error("tanpa device_token");
  await page.evaluate((t) => localStorage.setItem("snapyos_device_token", t), token);

  // ================= A. QRIS: buat QR & layar scan =================
  await toPackageScreen(token);
  await pickPackage();
  await toMethodPicker();
  await page.locator("button").filter({ hasText: /QRIS/i }).first().click();
  await page.waitForFunction(() => /SCAN QRIS|QR tidak tersedia|Menunggu pembayaran/i.test(document.body.innerText), null, { timeout: 12000 }).catch(() => {});
  await sleep(1500);
  await page.screenshot({ path: SHOT("a-qris") });
  const qrisBody = await text();
  const qrImg = await page.locator('img[alt="Kode QR pembayaran"]').count();
  record("QRIS: layar scan tampil (bukan error)", /SCAN QRIS/i.test(qrisBody), qrisBody.slice(0, 90).replace(/\s+/g, " "));
  record("QRIS: gambar QR ter-render", qrImg > 0);
  record("QRIS: nominal + countdown tampil", /Rp\s?[\d.]+/i.test(qrisBody) && /BERAKHIR|Berakhir/i.test(qrisBody));

  // Selesaikan pembayaran QRIS lewat simulasi sandbox Pakasir → harus jadi paid
  // dan membuka sesi. Membuktikan jalur bayar QRIS benar-benar sampai sesi.
  if (process.env.E2E_AUTO_SIMULATE !== "0") {
    const { data: pay } = await sb.from("payments")
      .select("order_id, final_amount, total_amount, status")
      .eq("photobox_id", PHOTOBOX_ID).in("status", ["creating", "pending"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (pay?.order_id) {
      await sleep(1500);
      const sim = await fetch("https://app.pakasir.com/api/paymentsimulation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: env.PAKASIR_PROJECT_SLUG, order_id: pay.order_id, amount: pay.final_amount ?? pay.total_amount ?? 0, api_key: env.PAKASIR_API_KEY }),
      }).catch(() => null);
      const paidOk = await page.waitForFunction(() => /PILIH FRAME/i.test(document.body.innerText), null, { timeout: 25000 })
        .then(() => true).catch(() => false);
      record("QRIS: pembayaran sukses → sesi dibuka", paidOk, `simulate=${sim?.status ?? "err"} order=${pay.order_id}`);
    } else {
      record("QRIS: pembayaran sukses → sesi dibuka", false, "payment pending tidak ditemukan");
    }
  }

  // ================= B. Tunai: layar bayar di kasir =================
  await resetBooth();
  await toPackageScreen(token);
  await pickPackage();
  await toMethodPicker();
  await page.locator("button").filter({ hasText: /BAYAR DI KASIR/i }).first().click();
  await page.waitForFunction(() => /Hubungi petugas|Bayarkan/i.test(document.body.innerText), null, { timeout: 12000 }).catch(() => {});
  await sleep(800);
  await page.screenshot({ path: SHOT("b-cash") });
  record("Tunai: layar 'hubungi petugas' tampil", /HUBUNGI PETUGAS|Bayarkan/i.test(await text()));

  // ================= C. Voucher AUDITFREE → paid → sesi =================
  await resetBooth();
  await toPackageScreen(token);
  await pickPackage();
  await toMethodPicker();
  await page.locator("button").filter({ hasText: /VOUCHER/i }).first().click();
  await page.waitForFunction(() => /VOUCHER SESI|Masukkan kode voucher/i.test(document.body.innerText), null, { timeout: 8000 });
  await page.locator('input[type="text"], input:not([type])').first().fill(VOUCHER);
  await page.getByRole("button", { name: /Gunakan voucher/i }).first().click();
  const paid = await page.waitForFunction(
    () => /PILIH FRAME|PILIH PEMBAYARAN.*Terjadi|PILIH METODE|EDIT FOTO/i.test(document.body.innerText),
    null, { timeout: 15000 }
  ).then(() => true).catch(() => false);
  await page.waitForFunction(() => /PILIH FRAME/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  await sleep(1200);
  await page.screenshot({ path: SHOT("c-voucher") });
  record("Voucher penuh → sesi dibuka (layar pilih frame)", /PILIH FRAME/i.test(await text()), (await text()).slice(0, 80).replace(/\s+/g, " "));
  if (!/PILIH FRAME/i.test(await text())) throw new Error("voucher tidak membuka sesi — hentikan flow");

  // ================= D. Frame ber-slot =================
  await page.waitForFunction(() => !/Memuat\.\.\./.test(document.body.innerText), null, { timeout: 12000 }).catch(() => {});
  await sleep(600);
  const frameBtns = page.locator('button:has-text("FOTO")').filter({ hasNotText: /Tanpa frame/i });
  const frameCount = await frameBtns.count();
  record("Frame ber-slot tersedia di paket ini", frameCount > 0, `${frameCount} frame`);
  await page.screenshot({ path: SHOT("d-frames") });
  if (frameCount > 0) await frameBtns.first().click();
  await sleep(1200);
  const useBtn = page.getByRole("button", { name: /Gunakan frame|Lanjut|Mulai foto/i }).first();
  if (await useBtn.count()) await useBtn.click();
  await sleep(1200);

  // ================= E. Capture semua slot =================
  await page.waitForFunction(() => /CAPTURE|Ambil foto|Menyiapkan kamera|Foto \d/i.test(document.body.innerText), null, { timeout: 25000 });
  await sleep(2500);
  const vid = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { readyState: v.readyState, w: v.videoWidth, srcObj: Boolean(v.srcObject) } : null;
  });
  record("Kamera preview live (frame tampil)", Boolean(vid && vid.readyState >= 2 && vid.w > 0), JSON.stringify(vid));
  await page.screenshot({ path: SHOT("e-capture") });

  const shoot = () => page.getByRole("button", { name: /^Ambil foto \d+\/\d+$|Ambil foto|Menyiapkan kamera/i }).first();
  let guard = 0;
  while (guard++ < 8) {
    if (await isEditor()) break;
    if (!/Ambil foto/i.test(await text())) break;
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll("button")].find((x) => /Ambil foto/i.test(x.innerText) && !/Menyiapkan/i.test(x.innerText));
        return b && !b.disabled;
      },
      null, { timeout: 15000 }
    ).catch(() => {});
    await shoot().click();
    await page.waitForFunction(() => /Foto berhasil diambil|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    if (await isEditor()) break;
    const next = page.getByRole("button", { name: /Lanjut edit|^Lanjut$/i }).first();
    if (await next.count()) { await next.click(); await sleep(1200); }
  }
  await page.waitForFunction(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText), null, { timeout: 20000 });
  record("Capture semua slot → layar editor", await isEditor(), (await text()).slice(0, 80).replace(/\s+/g, " "));
  await page.screenshot({ path: SHOT("f-editor") });

  // ================= F. Editor: filter + finish =================
  const filterBtn = page.locator('button[aria-pressed]').filter({ hasText: /B&W|FILM|WARM|COOL/i }).first();
  if (await filterBtn.count()) { await filterBtn.click(); await sleep(500); }
  record("Editor: filter dapat dipilih", await filterBtn.count() > 0);

  // Stub window.print → dispatch afterprint (Chrome kiosk --kiosk-printing tak ada di headless).
  await page.evaluate(() => {
    window.__snapyosPrint = { calls: 0 };
    window.print = () => {
      window.__snapyosPrint.calls += 1;
      setTimeout(() => window.dispatchEvent(new Event("afterprint")), 150);
    };
  });
  const finishBtn = page.getByRole("button", { name: /Selesai|Menyimpan/i }).first();
  record("Editor: tombol Selesai tersedia", (await finishBtn.count()) > 0);
  await finishBtn.click();

  // Finalize → (print) → result
  await page.waitForFunction(
    () => /Foto kamu jadi|Pindai QR|Permintaan cetak|Siap dicetak|Gagal mencetak|Hasil digital siap/i.test(document.body.innerText),
    null, { timeout: 25000 }
  ).catch(() => {});
  await sleep(1500);
  await page.screenshot({ path: SHOT("g-after-finish") });
  const afterBody = await text();
  record("Finalize → layar print/result", /Foto kamu jadi|Permintaan cetak|Siap dicetak|Hasil digital siap|Pindai QR/i.test(afterBody), afterBody.slice(0, 90).replace(/\s+/g, " "));

  // Kalau masih di layar print manual (auto_print false), klik Cetak.
  const manualPrint = page.getByRole("button", { name: /Cetak \d+ lembar|Cetak/i }).first();
  if (/Siap dicetak/i.test(await text()) && (await manualPrint.count())) {
    await manualPrint.click();
    await sleep(1500);
  }
  await page.waitForFunction(() => /Foto kamu jadi|Pindai QR|Hasil digital siap/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
  await sleep(1000);
  await page.screenshot({ path: SHOT("h-result") });
  const resultBody = await text();
  record("Layar hasil tampil", /Foto kamu jadi|Pindai QR|Hasil digital siap/i.test(resultBody), resultBody.slice(0, 80).replace(/\s+/g, " "));

  // QR di layar hasil
  const resultQr = await page.locator('img[alt="QR code menuju hasil foto"]').count();
  record("Layar hasil: QR code ter-render", resultQr > 0);

  // Ambil result token dari DB. result_token hidup di checkout_sessions; relasi
  // ke sesi lewat checkout_sessions.session_id (sessions tak punya checkout_session_id).
  const { data: sess } = await sb.from("sessions")
    .select("id, status, finalized_at")
    .eq("photobox_id", PHOTOBOX_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: checkout } = sess?.id
    ? await sb.from("checkout_sessions").select("result_token, status").eq("session_id", sess.id).maybeSingle()
    : { data: null };
  const resultToken = checkout?.result_token ?? null;
  record(
    "Finalize tersimpan di DB (session completed + checkout punya result_token)",
    sess?.status === "completed" && Boolean(resultToken),
    `session=${sess?.status} checkout=${checkout?.status}`
  );

  // ================= G. Halaman result /r/[token] =================
  if (resultToken) {
    const rRes = await page.request.get(`${BASE}/r/${resultToken}`);
    record("Halaman hasil /r/[token] → 200", rRes.status() === 200, `status=${rRes.status()}`);
    await page.goto(`${BASE}/r/${resultToken}`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    await page.screenshot({ path: SHOT("i-result-page") });
    const rBody = await text();
    record("Halaman hasil menampilkan foto/GIF", /Foto kamu siap|GIF|Unduh/i.test(rBody), rBody.slice(0, 80).replace(/\s+/g, " "));

    const apiRes = await page.request.get(`${BASE}/api/v1/public/results/${resultToken}`);
    const apiJson = await apiRes.json().catch(() => null);
    record("API result mengembalikan data (bukan 404)", apiRes.status() === 200 && Boolean(apiJson?.data), `status=${apiRes.status()}`);
  } else {
    record("Halaman hasil /r/[token]", false, "tidak ada result_token");
  }

  // ================= H. Link hasil kedaluwarsa =================
  if (resultToken && sess?.id) {
    // Set finalized_at jauh ke belakang → lewat retention (3 hari) → NOT_FOUND.
    const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    await sb.from("sessions").update({ finalized_at: old }).eq("id", sess.id);
    const expApi = await page.request.get(`${BASE}/api/v1/public/results/${resultToken}`);
    record("Link kedaluwarsa: API result → 404", expApi.status() === 404, `status=${expApi.status()}`);
    const expPage = await page.request.get(`${BASE}/r/${resultToken}`);
    record("Link kedaluwarsa: halaman /r/[token] → 404", expPage.status() === 404, `status=${expPage.status()}`);
    // Pulihkan agar tidak mengganggu test lain.
    await sb.from("sessions").update({ finalized_at: sess.finalized_at }).eq("id", sess.id);
  }
} catch (e) {
  record("Eksekusi flow", false, e.message);
  await page.screenshot({ path: SHOT("99-error") }).catch(() => {});
} finally {
  console.log("\n--- Console errors ---");
  console.log(consoleErrors.length ? consoleErrors.join("\n") : "(none)");
  console.log("\n--- Page errors ---");
  console.log(pageErrors.length ? pageErrors.join("\n") : "(none)");

  record("Tidak ada console error aplikasi", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  record("Tidak ada page error", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== K-FULL Kiosk E2E: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) console.log("FAILED:\n" + failed.map((f) => ` - ${f.name} :: ${f.detail}`).join("\n"));
  process.exit(failed.length ? 1 : 0);
}
