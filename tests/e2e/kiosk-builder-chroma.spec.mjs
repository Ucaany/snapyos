/**
 * BUILDER → KIOSK → CHROMA → GIF.
 *
 * Membuktikan pipeline chroma di kiosk berjalan end-to-end tanpa hardware:
 * - template 2 slot memaksa dua capture;
 * - toggle chroma mulai ON dari `camera_settings.chroma_key_enabled`;
 * - kamera hijau → status "Latar dihapus";
 * - kamera non-hijau → gate menolak dengan warning, hasil tidak rusak;
 * - finalize sukses dan `result.gif` terbentuk (bukan frame hijau).
 *
 * Langkah UI builder (upload frame → builder → publish) diverifikasi manual
 * karena memerlukan login owner; seed template di bawah memakai kontrak DB
 * yang sama dengan hasil builder. Jalankan: `npm run test:e2e:builder`.
 *
 * Prasyarat: dev server + `DEV_SKIP_PAYMENT=true` + Supabase service role.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { config, requireServiceRole } from "./helpers/env.mjs";
import {
  activateDevice,
  createAdmin,
  mintActivationCode,
  resetBooth,
  resolvePhotobox,
} from "./helpers/booth.mjs";
import { collectConsole, launchKiosk, seedDevice } from "./helpers/browser.mjs";
import { writeSolidY4m, YUV } from "./helpers/fixtures.mjs";
import { captureAll } from "./helpers/flows.mjs";
import { createReporter } from "./helpers/report.mjs";

const cfg = config();
requireServiceRole(cfg);
const report = createReporter("kiosk-builder-chroma");
const sb = createAdmin(cfg.supabaseUrl, cfg.serviceKey);
const { business, photobox } = await resolvePhotobox(sb, cfg.businessSlug, cfg.photoboxSlug);

const stamp = Date.now();
const templateName = `E2E Chroma ${stamp}`;
const dir = mkdtempSync(join(tmpdir(), "snapyos-chroma-"));
const greenVideo = writeSolidY4m(join(dir, "green.y4m"), YUV.green);
const blueVideo = writeSolidY4m(join(dir, "blue.y4m"), YUV.blue);

const previousCamera = photobox.camera_settings ?? {};
const previousPrint = photobox.print_settings ?? {};
let templateId = null;

async function waitFor(predicate, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate().catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timeout menunggu ${label}`);
}

async function configHasChroma() {
  const res = await fetch(`${cfg.base}/api/v1/public/${cfg.businessSlug}?photobox=${cfg.photoboxSlug}`);
  if (!res.ok) return false;
  const json = await res.json().catch(() => null);
  return json?.data?.photobox?.camera_settings?.chroma_key_enabled === true;
}

async function configHasTemplate() {
  const res = await fetch(`${cfg.base}/api/v1/public/${cfg.businessSlug}/templates`);
  if (!res.ok) return false;
  const json = await res.json().catch(() => null);
  return (json?.data ?? []).some(
    (entry) => entry.id === templateId && (entry.package_ids ?? []).length > 0
  );
}

/** Jalankan satu sesi kiosk penuh; `expectApplied` membedakan hijau/non-hijau. */
async function runSession({ video, expectApplied }) {
  process.env.E2E_FAKE_VIDEO = video;
  const code = await mintActivationCode(sb, photobox.id, business.id);
  const token = await activateDevice(cfg.base, code);
  const { context } = await launchKiosk({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = collectConsole(page);
  const badResponses = [];
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url().slice(0, 120)}`);
  });
  let finalize = null;
  page.on("response", async (response) => {
    if (!response.url().includes("/finalize")) return;
    let parsed = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    finalize = { status: response.status(), data: parsed?.data ?? null };
  });

  try {
    await seedDevice(page, { token, photoboxSlug: cfg.photoboxSlug });
    await page.goto(cfg.kioskUrl, { waitUntil: "domcontentloaded" });
    const start = page.getByRole("button", { name: /mulai|start/i }).first();
    await start.waitFor({ timeout: 60_000 });
    await start.click();
    const guide = page.getByRole("button", { name: /^mulai$/i }).first();
    if (await guide.isVisible({ timeout: 3_000 }).catch(() => false)) await guide.click();

    const duo = page.getByRole("button", { name: /paket duo/i }).first();
    await duo.waitFor({ timeout: 60_000 }).catch(async (error) => {
      const screen = (await page.locator("body").innerText().catch(() => "")).slice(-800);
      throw new Error(`${error.message}; screen=${screen}`);
    });
    await duo.click({ force: true });

    await page.getByRole("heading", { name: /pilih frame/i }).waitFor({ timeout: 30_000 });
    await page.getByText(/memuat\.\.\./i).waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);

    const card = page.getByRole("button", { name: new RegExp(templateName, "i") }).first();
    await card.waitFor({ timeout: 60_000 });
    const slotBadge = await card.innerText();
    report.record("kartu template menampilkan 2 FOTO", /2\s*foto/i.test(slotBadge), slotBadge.trim());
    await card.click();
    await page.getByRole("button", { name: /gunakan frame/i }).click();

    await captureAll(page, 2);
    await page.getByText(/edit foto/i).first().waitFor({ timeout: 30_000 });

    const toggle = page.getByRole("button", { name: /hapus latar hijau|latar dihapus|latar tidak dihapus|memproses/i }).first();
    await toggle.waitFor({ timeout: 20_000 });
    report.record("chroma otomatis ON dari flag booth", (await toggle.getAttribute("aria-pressed")) === "true");

    if (expectApplied) {
      await page.getByRole("button", { name: /latar dihapus/i }).first().waitFor({ timeout: 45_000 });
      report.record("layar hijau → latar dihapus", true);
    } else {
      await page
        .getByText(/latar tidak terdeteksi hijau/i)
        .first()
        .waitFor({ timeout: 45_000 });
      report.record("non-hijau → warning gate tanpa merusak hasil", true);
    }

    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 30_000 });
    const composite = await canvas.evaluate((element) => {
      const node = element;
      return { width: node.width, height: node.height, ratio: node.width / Math.max(1, node.height) };
    });
    report.record(
      "composite mengikuti kanvas 2 slot (1:3)",
      Math.abs(composite.ratio - 1 / 3) < 0.02,
      JSON.stringify(composite)
    );

    await page.getByRole("button", { name: /^selesai$/i }).click({ force: true });
    await waitFor(async () => finalize !== null, "finalize selesai");
    report.record("finalize sukses", finalize?.status === 200, JSON.stringify(finalize?.status));

    const gifUrl = finalize?.data?.gif_url ?? null;
    report.record("GIF hasil dibuat", Boolean(gifUrl), String(gifUrl));

    const resultHeading = page.getByText(/foto kamu jadi|hasil digital siap|selesai/i).first();
    report.record(
      "layar hasil tampil",
      await resultHeading.isVisible({ timeout: 60_000 }).catch(() => false)
    );

    if (gifUrl && expectApplied) {
      const gif = Buffer.from(await (await fetch(gifUrl)).arrayBuffer());
      const meta = await sharp(gif).metadata();
      const { data, info } = await sharp(gif).raw().toBuffer({ resolveWithObject: true });
      let greenish = 0;
      let sampled = 0;
      for (let i = 0; i + info.channels <= data.length; i += info.channels * 97) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        sampled += 1;
        if (g > r * 1.15 && g > b * 1.15 && g >= 60) greenish += 1;
      }
      report.record("GIF > 1 frame", (meta.pages ?? 1) > 1, `pages=${meta.pages ?? 1}`);
      report.record(
        "GIF bebas latar hijau",
        sampled > 0 && greenish / sampled < 0.2,
        `greenish=${greenish}/${sampled}`
      );
    }

    report.record("tanpa console error", errors.length === 0, errors.slice(0, 3).join(" | "));
    report.record("tanpa respons HTTP 4xx/5xx", badResponses.length === 0, badResponses.slice(0, 5).join(" | "));
    await context.close();
  } finally {
    await context.close().catch(() => undefined);
  }
}

try {
  await resetBooth(sb, photobox.id);
  await sb
    .from("photoboxes")
    .update({
      camera_settings: { ...previousCamera, chroma_key_enabled: true },
      print_settings: { ...previousPrint, enabled: false },
    })
    .eq("id", photobox.id);

  // Frame sumber dipinjam dari template yang sudah ada di dev — kiosk
  // menandatangani `file_url` yang sama. Layout diganti 2 slot.
  // `thumbnail_url` WAJIB ikut: bila null, public-config menempel `?w=480`
  // ke signed URL R2 dan merusak tanda tangan SigV4 (proxy 403).
  const { data: source, error: sourceError } = await sb
    .from("templates")
    .select("file_url, thumbnail_url, layout")
    .eq("business_id", business.id)
    .not("layout", "is", null)
    .limit(1)
    .maybeSingle();
  if (sourceError || !source?.file_url) throw sourceError ?? new Error("Template sumber tidak ada");

  const { data: inserted, error: insertError } = await sb
    .from("templates")
    .insert({
      business_id: business.id,
      name: templateName,
      category: "custom",
      file_url: source.file_url,
      thumbnail_url: source.thumbnail_url ?? source.file_url,
      is_active: true,
      is_premium: false,
      layout: {
        version: 1,
        canvas: { width: 600, height: 1800, preset: "2x6-strip" },
        slots: [
          { id: "slot-1", x: 95, y: 60, width: 409, height: 800, z: 0, rotation: 0, shape: "rect", fit: "cover" },
          { id: "slot-2", x: 95, y: 920, width: 409, height: 800, z: 1, rotation: 0, shape: "rect", fit: "cover" },
        ],
      },
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  templateId = inserted.id;

  // Kiosk menampilkan template yang ter-assign ke paket terpilih lebih dulu;
  // tanpa link ini template uji tersaring keluar dari grid Paket Duo.
  const { data: packages, error: packageError } = await sb
    .from("packages")
    .select("id")
    .eq("business_id", business.id)
    .eq("is_active", true);
  if (packageError) throw packageError;
  if ((packages ?? []).length > 0) {
    const { error: linkError } = await sb
      .from("package_templates")
      .insert(packages.map((entry) => ({ package_id: entry.id, template_id: templateId })));
    if (linkError) throw linkError;
  }

  await waitFor(configHasChroma, "config publik memuat flag chroma");
  await waitFor(configHasTemplate, "daftar template publik memuat template uji");

  await runSession({ video: greenVideo, expectApplied: true });
  await resetBooth(sb, photobox.id);
  await runSession({ video: blueVideo, expectApplied: false });
} finally {
  await resetBooth(sb, photobox.id);
  if (templateId) await sb.from("templates").delete().eq("id", templateId);
  await sb
    .from("photoboxes")
    .update({ camera_settings: previousCamera, print_settings: previousPrint })
    .eq("id", photobox.id);
  delete process.env.E2E_FAKE_VIDEO;
}

report.finish();