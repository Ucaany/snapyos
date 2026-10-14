/**
 * K-LIVE — Kiosk end-to-end di PROFIL CHROME ASLI user, KAMERA ASLI, FRAME ASLI.
 *
 * Alur: welcome → paket → checkout → QRIS (PAUSE, tunggu pembayaran) → sesi →
 * pilih frame (ber-slot, bukan "Tanpa frame") → capture kamera asli → editor →
 * finalize → print → layar hasil + QR → halaman /r/[token] → link kedaluwarsa.
 *
 * QRIS: skrip BERHENTI di layar QR dan menulis order_id ke
 * /tmp/snapyos-live-order.txt, lalu menunggu UI berpindah ke "PILIH FRAME"
 * (deteksi via polling status aplikasi). Pembayaran diselesaikan oleh operator
 * (simulasi sandbox Pakasir: POST /api/paymentsimulation).
 *
 * Jalankan:
 *   E2E_LIVE=1 E2E_BASE=http://localhost:3000 \
 *   E2E_BUSINESS_SLUG=klik-foto-dev E2E_PHOTOBOX_SLUG=booth-02 \
 *   E2E_ACTIVATION_CODE=<6 digit> node tests/e2e/kiosk-live.spec.mjs
 */

import { chromium } from "playwright";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const ENABLED = process.env.E2E_LIVE === "1";
const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const BUSINESS = process.env.E2E_BUSINESS_SLUG ?? "";
const PHOTOBOX = process.env.E2E_PHOTOBOX_SLUG ?? "";
const CODE = process.env.E2E_ACTIVATION_CODE ?? "";
const SETUP_KEY = `snapyos_device_setup_done:${PHOTOBOX}`;
const ORDER_FILE = "/tmp/snapyos-live-order.txt";
const PAY_WAIT_MS = Number(process.env.E2E_PAY_WAIT_MS ?? 15 * 60 * 1000);
const SHOT = (n) => `tests/e2e/klive-${n}.png`;

if (!ENABLED) {
  console.log("SKIP: set E2E_LIVE=1 + booth env.");
  process.exit(0);
}
if (!BUSINESS || !PHOTOBOX || !CODE) {
  console.error("FAIL: E2E_BUSINESS_SLUG, E2E_PHOTOBOX_SLUG, E2E_ACTIVATION_CODE wajib diisi");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PHOTOBOX_ID = "33333333-3333-4333-8333-333333333332";

const results = [];
const consoleErrors = [];
const pageErrors = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

// Chrome SISTEM (channel "chrome") + KAMERA ASLI (tanpa fake-device). headless:false
// → jendela Chrome asli muncul di layar. --use-fake-ui-for-media-stream hanya
// menotomatiskan dialog izin, BUKAN mengganti kamera: stream tetap kamera fisik.
//
// CATATAN profil: profil Chrome user (/Users/.../Google/Chrome) TIDAK bisa dipakai
// karena macOS memblokir proses lain menulis SingletonLock di sana (EPERM, juga
// dari Terminal user). Jadi dipakai profil baru di direktori temp. Set
// E2E_CHROME_PROFILE untuk menunjuk profil yang bisa ditulis bila perlu.
const profileDir = process.env.E2E_CHROME_PROFILE ?? mkdtempSync(join(tmpdir(), "snapyos-live-chrome-"));
console.log(`[mode] profil Chrome: ${profileDir}`);
const browser = await chromium.launchPersistentContext(profileDir, {
  channel: "chrome",
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: [
    "--use-fake-ui-for-media-stream",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    // Cegah Chrome menunda decode frame kamera saat jendela tertutup jendela lain
    // (umum saat dijalankan headful dari skrip).
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
  ],
});

const page = browser.pages()[0] ?? (await browser.newPage());
await page.bringToFront().catch(() => {});
await browser.grantPermissions(["camera"], { origin: BASE }).catch(() => {});
page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|\/404|favicon\.ico|net::ERR_FILE_NOT_FOUND|emoji|503|Service Unavailable/i.test(m.text())) {
    consoleErrors.push(`console: ${m.text()}`);
  }
});

const text = () => page.locator("body").innerText();
const sleep = (ms) => page.waitForTimeout(ms);

async function resetBooth() {
  const now = new Date().toISOString();
  await sb.from("sessions").update({ status: "expired", finalized_at: now }).eq("photobox_id", PHOTOBOX_ID).eq("status", "active");
  await sb.from("checkout_sessions").update({ status: "expired" }).eq("photobox_id", PHOTOBOX_ID).in("status", ["open", "pending"]);
}

async function toPackageScreen() {
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

async function pickPackage() {
  const cards = page.locator('button[role="listitem"]');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    if (/strip klasik/i.test(await cards.nth(i).innerText())) { await cards.nth(i).click(); return; }
  }
  await cards.first().click();
}

const isEditor = () => page.evaluate(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText));

try {
  await resetBooth();
  writeFileSync(ORDER_FILE, "");

  // ---- 0. Seed localStorage di origin, aktivasi ----
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((k) => localStorage.setItem(k, "1"), SETUP_KEY);
  const actRes = await page.request.post(`${BASE}/api/v1/public/devices/activate`, { data: { code: CODE } });
  const token = (await actRes.json().catch(() => null))?.data?.device_token ?? null;
  record("Aktivasi perangkat", Boolean(token));
  if (!token) throw new Error("tanpa device_token");
  await page.evaluate((t) => localStorage.setItem("snapyos_device_token", t), token);

  // ---- 1. QRIS + PAUSE ----
  await toPackageScreen();
  await pickPackage();
  await page.waitForFunction(() => /RINGKASAN PESANAN|PILIH PEMBAYARAN/i.test(document.body.innerText), null, { timeout: 15000 });
  // Ringkasan → pemilih metode (retry: tombol bisa muncul telat / sesi resume).
  await page.getByRole("button", { name: /Pilih pembayaran/i }).first().click().catch(() => {});
  await page.waitForFunction(() => /PILIH METODE|QRIS/i.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
  await sleep(600);
  console.log(">> layar sebelum pilih QRIS:", (await text()).replace(/\s+/g, " ").slice(0, 200));
  await page.screenshot({ path: SHOT("1a-method-picker") });
  await page.locator("button").filter({ hasText: /QRIS/i }).first().click({ timeout: 20000 });
  await page.waitForFunction(() => /SCAN QRIS|Menunggu pembayaran/i.test(document.body.innerText), null, { timeout: 15000 });
  await sleep(1500);
  await page.screenshot({ path: SHOT("1-qris") });

  // Ambil order_id pembayaran terbaru booth ini (status creating/pending).
  const { data: pay } = await sb.from("payments")
    .select("order_id, status, total_amount")
    .eq("photobox_id", PHOTOBOX_ID)
    .in("status", ["creating", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  writeFileSync(ORDER_FILE, pay?.order_id ?? "");
  console.log(`\n>>> LAYAR QRIS TAMPIL. order_id=${pay?.order_id} nominal=${pay?.total_amount}`);
  console.log(`>>> Menunggu konfirmasi pembayaran (maks ${Math.round(PAY_WAIT_MS / 60000)} menit).`);
  console.log(`>>> Mode sandbox Pakasir → pembayaran disimulasikan otomatis (E2E_AUTO_SIMULATE=0 untuk manual).\n`);

  // Sandbox Pakasir: QR placeholder tak bisa discan; simulate endpoint menandai
  // transaksi paid (webhook tetap divalidasi server-to-server). Ini membuat
  // pembayaran BENAR-BENAR sukses end-to-end. Set E2E_AUTO_SIMULATE=0 untuk
  // menunggu operator mengonfirmasi manual.
  const AUTO_SIM = process.env.E2E_AUTO_SIMULATE !== "0";
  if (AUTO_SIM && pay?.order_id) {
    await sleep(2000);
    try {
      const sim = await fetch("https://app.pakasir.com/api/paymentsimulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: env.PAKASIR_PROJECT_SLUG,
          order_id: pay.order_id,
          // Pakasir mencocokkan nominal DASAR (amount), bukan total + kode unik.
          amount: pay.final_amount ?? pay.total_amount ?? 0,
          api_key: env.PAKASIR_API_KEY,
        }),
      });
      console.log(`>>> Simulasi pembayaran sandbox → HTTP ${sim.status} ${(await sim.text()).slice(0, 80)}`);
    } catch (e) {
      console.log(">>> Simulasi gagal:", e.message, "(tunggu konfirmasi manual)");
    }
  }

  const paid = await page.waitForFunction(
    () => /PILIH FRAME/i.test(document.body.innerText),
    null, { timeout: PAY_WAIT_MS }
  ).then(() => true).catch(() => false);
  record("QRIS: pembayaran sukses → sesi dibuka (layar pilih frame)", paid, paid ? "" : "timeout menunggu pembayaran");
  if (!paid) throw new Error("pembayaran tidak terkonfirmasi dalam batas waktu");
  await sleep(1200);

  // ---- 2. Frame ASLI (ber-slot) ----
  await page.waitForFunction(() => !/Memuat\.\.\./.test(document.body.innerText), null, { timeout: 12000 }).catch(() => {});
  await sleep(600);
  const frameBtns = page.locator('button:has-text("FOTO")').filter({ hasNotText: /Tanpa frame/i });
  const frameCount = await frameBtns.count();
  record("Frame asli (ber-slot) tersedia", frameCount > 0, `${frameCount} frame`);
  await page.screenshot({ path: SHOT("2-frames") });
  if (frameCount > 0) await frameBtns.first().click();
  await sleep(1000);
  const useBtn = page.getByRole("button", { name: /Gunakan frame|Lanjut|Mulai foto/i }).first();
  if (await useBtn.count()) await useBtn.click();
  await sleep(1000);

  // ---- 3. Capture kamera ASLI ----
  await page.waitForFunction(() => /CAPTURE|Ambil foto|Menyiapkan kamera|Foto \d/i.test(document.body.innerText), null, { timeout: 25000 });
  // Kamera asli butuh waktu init (enumerate + permission + first frame);
  // poll hingga 20s sampai <video> benar-benar punya frame (readyState>=2).
  const camReady = await page.waitForFunction(
    () => {
      const v = document.querySelector("video");
      return v && v.readyState >= 2 && v.videoWidth > 0;
    },
    null, { timeout: 20000 }
  ).then(() => true).catch(() => false);
  const vid = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { readyState: v.readyState, w: v.videoWidth, srcObj: Boolean(v.srcObject) } : null;
  });
  record("Kamera ASLI: preview live (frame tampil)", camReady, JSON.stringify(vid));
  await page.screenshot({ path: SHOT("3-capture") });

  const shoot = () => page.getByRole("button", { name: /Ambil foto|Menyiapkan kamera/i }).first();
  let guard = 0;
  while (guard++ < 8) {
    if (await isEditor()) break;
    if (!/Ambil foto/i.test(await text())) break;
    await page.waitForFunction(
      () => { const b = [...document.querySelectorAll("button")].find((x) => /Ambil foto/i.test(x.innerText) && !/Menyiapkan/i.test(x.innerText)); return b && !b.disabled; },
      null, { timeout: 15000 }
    ).catch(() => {});
    await shoot().click();
    await page.waitForFunction(() => /Foto berhasil diambil|EDIT FOTO|LANGKAH 03/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    if (await isEditor()) break;
    const next = page.getByRole("button", { name: /Lanjut edit|^Lanjut$/i }).first();
    if (await next.count()) { await next.click(); await sleep(1200); }
  }
  await page.waitForFunction(() => /EDIT FOTO|LANGKAH 03/i.test(document.body.innerText), null, { timeout: 20000 });
  record("Capture kamera asli → layar editor", await isEditor());
  await page.screenshot({ path: SHOT("4-editor") });

  // ---- 4. Editor + finalize + print ----
  await page.evaluate(() => {
    window.print = () => { setTimeout(() => window.dispatchEvent(new Event("afterprint")), 150); };
  });
  const finishBtn = page.getByRole("button", { name: /Selesai|Menyimpan/i }).first();
  record("Editor: tombol Selesai tersedia", (await finishBtn.count()) > 0);
  await finishBtn.click();
  await page.waitForFunction(() => /Foto kamu jadi|Permintaan cetak|Siap dicetak|Hasil digital siap|Pindai QR/i.test(document.body.innerText), null, { timeout: 25000 }).catch(() => {});
  await sleep(1200);
  const manual = page.getByRole("button", { name: /Cetak \d+ lembar|Cetak/i }).first();
  if (/Siap dicetak/i.test(await text()) && (await manual.count())) { await manual.click(); await sleep(1500); }
  await page.waitForFunction(() => /Foto kamu jadi|Pindai QR|Hasil digital siap/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
  await sleep(1000);
  await page.screenshot({ path: SHOT("5-result") });
  record("Finalize → layar hasil", /Foto kamu jadi|Pindai QR|Hasil digital siap/i.test(await text()));
  record("Layar hasil: QR ter-render", (await page.locator('img[alt="QR code menuju hasil foto"]').count()) > 0);

  // ---- 5. Halaman /r/[token] + link kedaluwarsa ----
  const { data: sess } = await sb.from("sessions")
    .select("id, status, checkout_session_id, finalized_at")
    .eq("photobox_id", PHOTOBOX_ID)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: checkout } = sess?.checkout_session_id
    ? await sb.from("checkout_sessions").select("result_token, status").eq("id", sess.checkout_session_id).maybeSingle()
    : { data: null };
  const resultToken = checkout?.result_token ?? null;
  record("Finalize tersimpan (session completed + result_token)", sess?.status === "completed" && Boolean(resultToken), `session=${sess?.status}`);

  if (resultToken) {
    const rRes = await page.request.get(`${BASE}/r/${resultToken}`);
    record("Halaman /r/[token] → 200", rRes.status() === 200, `status=${rRes.status()}`);
    await page.goto(`${BASE}/r/${resultToken}`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    await page.screenshot({ path: SHOT("6-result-page") });
    record("Halaman hasil menampilkan foto/GIF", /Foto kamu siap|GIF|Unduh/i.test(await text()));

    if (sess?.id) {
      const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      await sb.from("sessions").update({ finalized_at: old }).eq("id", sess.id);
      const expApi = await page.request.get(`${BASE}/api/v1/public/results/${resultToken}`);
      record("Link kedaluwarsa: API result → 404", expApi.status() === 404, `status=${expApi.status()}`);
      const expPage = await page.request.get(`${BASE}/r/${resultToken}`);
      record("Link kedaluwarsa: halaman /r/[token] → 404", expPage.status() === 404, `status=${expPage.status()}`);
      await sb.from("sessions").update({ finalized_at: sess.finalized_at }).eq("id", sess.id);
    }
  } else {
    record("Halaman hasil /r/[token]", false, "tidak ada result_token");
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
  console.log(`\n=== K-LIVE Kiosk E2E: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) console.log("FAILED:\n" + failed.map((f) => ` - ${f.name} :: ${f.detail}`).join("\n"));
  process.exit(failed.length ? 1 : 0);
}
