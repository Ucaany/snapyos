/**
 * TEMPLATE CACHE — boot booth mengunduh thumbnail/frame ke Cache Storage,
 * reload berikutnya merender grid dari snapshot (tanpa skeleton), dan API
 * daftar tidak dipanggil per boot.
 *
 * Prasyarat: dev server + `DEV_SKIP_PAYMENT=true` + Supabase service role.
 * Jalankan: `node tests/e2e/kiosk-template-cache.spec.mjs`
 */

import { config, requireServiceRole } from "./helpers/env.mjs";
import {
  activateDevice,
  createAdmin,
  mintActivationCode,
  resetBooth,
  resolvePhotobox,
} from "./helpers/booth.mjs";
import { collectConsole, launchKiosk, seedDevice } from "./helpers/browser.mjs";
import { startPackage } from "./helpers/flows.mjs";
import { createReporter } from "./helpers/report.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-template-cache");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);
const { business, photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);
await resetBooth(sb, photobox.id);
const code = await mintActivationCode(sb, photobox.id, business.id);
const token = await activateDevice(cfg.base, code);

const API_TEMPLATES = `${cfg.base}/api/v1/public/${cfg.businessSlug}/templates`;
const expected = await fetch(API_TEMPLATES)
  .then((res) => res.json())
  .then((json) => json?.data ?? [])
  .catch(() => []);
report.record(
  "endpoint daftar template menjawab",
  Array.isArray(expected),
  `count=${expected?.length ?? "?"}`
);

const SNAPSHOT_KEY = `snapyos.templates.${cfg.businessSlug}`;
const INDEX_KEY = `snapyos.template-index.${cfg.businessSlug}`;

const { context } = await launchKiosk();
const page = await context.newPage();
const errors = collectConsole(page);
const listRequests = [];
const frameResponses = [];
page.on("request", (request) => {
  if (request.url().includes("/templates")) listRequests.push(request.url());
});
page.on("response", (response) => {
  if (response.url().includes("/api/v1/public/frame"))
    frameResponses.push(response.fromServiceWorker());
});

async function openTemplateScreen() {
  await page
    .getByRole("button", { name: /mulai|start/i })
    .first()
    .waitFor({ timeout: 60_000 });
  await startPackage(page);
  await page.getByRole("heading", { name: /pilih frame/i }).waitFor({ timeout: 60_000 });
  await page
    .getByText(/memuat\.\.\./i)
    .first()
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => undefined);
}

async function readIndex() {
  return page.evaluate((indexKey) => {
    const raw = window.localStorage.getItem(indexKey);
    if (!raw) return { thumbs: 0, frames: 0, total: 0 };
    const entries = JSON.parse(raw)?.entries ?? [];
    return {
      thumbs: entries.filter((entry) => String(entry.key).endsWith("@480")).length,
      frames: entries.filter((entry) => String(entry.key).endsWith("@full")).length,
      total: entries.length,
    };
  }, INDEX_KEY);
}

try {
  await seedDevice(page, { token, photoboxSlug: cfg.photoboxSlug });
  await page.goto(cfg.kioskUrl, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: /mulai|start/i })
    .first()
    .waitFor({ timeout: 60_000 });

  // Warm berjalan saat idle di layar welcome.
  await page
    .waitForFunction(
      ([snapshotKey, indexKey]) => {
        const snapshot = window.localStorage.getItem(snapshotKey);
        const raw = window.localStorage.getItem(indexKey);
        if (!snapshot || !raw) return false;
        const entries = JSON.parse(raw)?.entries ?? [];
        return entries.some((entry) => String(entry.key).endsWith("@480"));
      },
      [SNAPSHOT_KEY, INDEX_KEY],
      { timeout: 180_000 }
    )
    .catch(() => undefined);

  const warmed = await readIndex();
  report.record(
    "snapshot daftar template tersimpan",
    (await page.evaluate((key) => Boolean(window.localStorage.getItem(key)), SNAPSHOT_KEY)) === true
  );
  report.record(
    "thumbnail semua template masuk Cache Storage",
    warmed.thumbs === expected.length && warmed.thumbs > 0,
    `thumbs=${warmed.thumbs} api=${expected.length}`
  );
  report.record("minimal satu frame penuh terunduh", warmed.frames >= 1, `frames=${warmed.frames}`);

  // Boot ke-2: snapshot segar dipakai; daftar tidak di-fetch ulang per boot.
  listRequests.length = 0;
  frameResponses.length = 0;
  await page.reload({ waitUntil: "domcontentloaded" });
  await openTemplateScreen();

  report.record(
    "boot ke-2 memanggil API daftar ≤ 1 kali",
    listRequests.length <= 1,
    `requests=${listRequests.length}`
  );

  const skeleton = await page.locator(".animate-pulse").count();
  report.record("grid tampil tanpa skeleton", skeleton === 0, `skeleton=${skeleton}`);

  await page
    .waitForFunction(
      () => [...document.images].some((img) => img.complete && img.naturalWidth > 0),
      null,
      {
        timeout: 30_000,
      }
    )
    .catch(() => undefined);
  report.record(
    "gambar frame dilayani service worker",
    frameResponses.some((served) => served === true),
    `responses=${frameResponses.length} served=${frameResponses.filter(Boolean).length}`
  );

  // Paksa revalidasi (snapshot basi) lalu gagalkan HANYA endpoint daftar:
  // grid harus tetap tampil dari snapshot + chip "Dari cache".
  await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    parsed.fetchedAt = 0;
    window.localStorage.setItem(key, JSON.stringify(parsed));
  }, SNAPSHOT_KEY);
  const abortList = (route) => route.abort();
  await page.route("**/api/v1/public/*/templates", abortList);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openTemplateScreen();

  const cachedChip = await page
    .getByText(/dari cache/i)
    .first()
    .isVisible()
    .catch(() => false);
  const frameCards = await page.getByRole("button", { name: /gunakan frame|tanpa frame/i }).count();
  report.record("fetch daftar gagal + snapshot ada → chip Dari cache", cachedChip);
  report.record("grid tetap dirender dari snapshot", frameCards > 0, `cards=${frameCards}`);
  await page.unroute("**/api/v1/public/*/templates", abortList);

  // Offline: buktikan biner thumbnail benar-benar tersedia di Cache Storage
  // (bukan hanya di memori) dan snapshot masih ada.
  await context.setOffline(true);
  const offline = await page.evaluate(
    async ([snapshotKey, indexKey]) => {
      const raw = window.localStorage.getItem(indexKey);
      const entries = raw ? JSON.parse(raw).entries : [];
      const thumb = entries.find((entry) => String(entry.key).endsWith("@480"));
      let cached = false;
      if (thumb) {
        const cache = await caches.open("snapyos-template-assets-v1");
        const base = thumb.key.slice(0, thumb.key.lastIndexOf("@"));
        cached = Boolean(
          await cache.match(`${window.location.origin}/__frame/${encodeURIComponent(base)}@480`)
        );
      }
      return {
        snapshot: Boolean(window.localStorage.getItem(snapshotKey)),
        cached,
      };
    },
    [SNAPSHOT_KEY, INDEX_KEY]
  );
  report.record("offline: snapshot tetap tersedia", offline.snapshot);
  report.record("offline: thumbnail tersedia di Cache Storage", offline.cached);
  await context.setOffline(false);
} catch (error) {
  report.record(
    "alur template cache berjalan",
    false,
    `${error.message}${errors.length ? ` :: console=${errors.slice(0, 3).join(" | ")}` : ""}`
  );
} finally {
  report.finish();
  await context.close();
}
