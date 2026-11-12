#!/usr/bin/env node
/**
 * Sinkronisasi katalog kamera gphoto2.
 *
 * Sumber utama `print-camera-list` lokal (json + html), fallback halaman
 * dukungan gphoto.org, lalu snapshot lama. Build/runtime tidak pernah fetch
 * internet: hanya script manual ini.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = join(ROOT, "src/data/gphoto2-cameras.json");
const OVERRIDES = join(ROOT, "src/data/gphoto2-camera-overrides.json");
const DOC = join(ROOT, "docs/17-supported-cameras.md");
const MIN_CAMERAS = 2000;
const STALE_DAYS = 180;

const CAMERA_TYPES = ["dslr", "mirrorless", "compact", "action", "other"];
const BOOTH_SUPPORT = ["full", "capture", "transfer", "unknown"];
const DRIVER_STATUS = ["production", "testing", "experimental", "deprecated", "unknown"];

const VENDOR_IDS = {
  "03f0": "HP",
  "040a": "Kodak",
  "04a5": "BenQ",
  "04a9": "Canon",
  "04b0": "Nikon",
  "04cb": "Fujifilm",
  "04da": "Panasonic",
  "04e8": "Samsung",
  "054c": "Sony",
  "07b4": "Olympus",
  "0869": "Casio",
  "0d96": "Apple",
  "0dca": "Casio",
};

const BRAND_TOKENS = [
  "Canon",
  "Nikon",
  "Sony",
  "Fujifilm",
  "Fuji",
  "Olympus",
  "OM",
  "Panasonic",
  "Lumix",
  "Pentax",
  "Ricoh",
  "Samsung",
  "Leica",
  "Kodak",
  "Casio",
  "HP",
  "Apple",
  "GoPro",
  "DJI",
  "Insta360",
  "Sigma",
  "Hasselblad",
  "Mamiya",
  "Contax",
  "Minolta",
  "Konica",
  "Epson",
  "Polaroid",
  "Agfa",
  "Aiptek",
  "Praktica",
  "Rollei",
  "Sanyo",
  "Toshiba",
  "JVC",
  "Medion",
  "Mustek",
  "BenQ",
];

const BRAND_ALIASES = {
  Fuji: "Fujifilm",
  Lumix: "Panasonic",
  "OM Digital Solutions": "OM",
  "OM System": "OM",
};

export function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function cleanText(value) {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `(PTP mode)`/`(Control)` adalah penanda koneksi, bukan bagian nama model. */
export function normalizeModel(raw) {
  return cleanText(raw)
    .replace(/\s*\((?:PTP mode|MTP mode|Control)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCameraListJson(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("print-camera-list json bukan array.");
  const map = new Map();
  for (const item of parsed) {
    if (!item || typeof item.model !== "string") continue;
    const model = normalizeModel(item.model);
    if (!model) continue;
    map.set(model.toLowerCase(), {
      camlib: typeof item.camlib === "string" ? item.camlib : undefined,
      id: typeof item.id === "string" ? item.id : undefined,
      vendor: typeof item["usb-vendor"] === "string" ? item["usb-vendor"] : undefined,
      product: typeof item["usb-product"] === "string" ? item["usb-product"] : undefined,
    });
  }
  return map;
}

/** Tabel support.php / print-camera-list html: model | abilities | komentar. */
export function parseCameraListHtml(html) {
  const rows = [];
  // Dua tabel: kamera (3 kolom) dan media player (1 kolom, tanpa abilities).
  const rowRe = /<tr>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRe.exec(html))) {
    const block = match[1];
    if (/<th[>\s]/i.test(block)) continue;
    const cells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
      cleanText(cell[1])
    );
    if (cells.length === 0) continue;
    const model = normalizeModel(cells[0]);
    if (!model) continue;
    if (cells.length >= 3) {
      rows.push({
        model,
        abilitiesText: cells[1] ?? "",
        comment: cells[2] ?? "",
        hasAbilities: true,
      });
    } else {
      rows.push({ model, abilitiesText: "", comment: "", hasAbilities: false });
    }
  }
  const version = /libgphoto2\s+([\d.]+)/i.exec(html)?.[1];
  const count = /Number of supported cameras and media players:\s*(\d+)/i.exec(html)?.[1];
  return { rows, version, count: count ? Number(count) : undefined };
}

export function abilitiesFromText(text) {
  const lower = text.toLowerCase();
  const abilities = [];
  if (lower.includes("image capture") || lower.includes("capture")) abilities.push("capture");
  if (lower.includes("trigger capture") || lower.includes("trigger")) abilities.push("trigger");
  if (lower.includes("liveview") || lower.includes("live view")) abilities.push("liveview");
  if (lower.includes("configuration") || lower.includes("config")) abilities.push("config");
  return [...new Set(abilities)];
}

export function driverStatusFromComment(comment) {
  const lower = comment.toLowerCase();
  if (lower.includes("deprecated")) return "deprecated";
  if (lower.includes("experimental")) return "experimental";
  if (lower.includes("testing") || lower.includes("beta")) return "testing";
  return comment ? "production" : "production";
}

export function boothSupportFromAbilities(abilities, hasAbilities) {
  if (!hasAbilities) return "unknown";
  if (abilities.includes("capture") || abilities.includes("trigger")) {
    return abilities.includes("liveview") ? "full" : "capture";
  }
  return "transfer";
}

export function brandOf(model, vendorId, overrides) {
  const exact = overrides?.brand?.exact?.[model];
  if (exact) return exact;
  for (const [prefix, brand] of Object.entries(overrides?.brand?.prefix ?? {})) {
    if (model.startsWith(prefix)) return brand;
  }
  const fromVendor = vendorId ? VENDOR_IDS[vendorId.toLowerCase()] : undefined;
  if (fromVendor) return fromVendor;
  const stripped = model.replace(/^vendor:\s*/i, "").trim();
  const first = stripped.split(/\s+/)[0] ?? "";
  if (BRAND_TOKENS.includes(first)) return BRAND_ALIASES[first] ?? first;
  return "Lainnya";
}

export function cameraTypeOf(model, brand, overrides) {
  const exact = overrides?.type?.exact?.[model];
  if (exact && CAMERA_TYPES.includes(exact)) return exact;
  for (const [prefix, type] of Object.entries(overrides?.type?.prefix ?? {})) {
    if (model.startsWith(prefix) && CAMERA_TYPES.includes(type)) return type;
  }
  const m = model.toLowerCase();
  if (/gopro|hero\s*\d|insta360|osmo|action cam|dji/.test(m)) return "action";
  if (brand === "Canon") {
    if (/eos\s+(?:m|r)\d/.test(m)) return "mirrorless";
    if (/eos\b/.test(m) && !/powershot/.test(m)) return "dslr";
    if (/powershot|ixus/.test(m)) return "compact";
  }
  if (brand === "Nikon") {
    if (/nikon\s+1\b|nikon\s+z\s*\d|\bz\s*\d/.test(m)) return "mirrorless";
    if (/nikon\s+d\d|\bd\d{2,4}\b/.test(m)) return "dslr";
    if (/coolpix/.test(m)) return "compact";
  }
  if (brand === "Sony") {
    if (/ilce|\bnex\b|\ba7\b|\ba6\d{3}\b|\bzv-?/.test(m)) return "mirrorless";
    if (/slt|ilca/.test(m)) return "dslr";
    if (/dsc|cybershot|cyber-shot/.test(m)) return "compact";
  }
  if (brand === "Fujifilm") {
    if (/x-[a-z0-9]|gfx/.test(m)) return "mirrorless";
    if (/finepix/.test(m)) return "compact";
  }
  if (brand === "Olympus" || brand === "OM") {
    if (/e-m\d|e-p\d|\bpen\b|om-d/.test(m)) return "mirrorless";
  }
  if (brand === "Panasonic") {
    if (/\bgh\d|\bgx\d|\bs1\b|\bs5\b/.test(m)) return "mirrorless";
    if (/dmc|fz|tz|lx/.test(m)) return "compact";
  }
  if (brand === "Pentax") {
    if (/^q\b/.test(m)) return "mirrorless";
    if (/k-\d/.test(m)) return "dslr";
  }
  if (brand === "Samsung" && /\bnx\b/.test(m)) return "mirrorless";
  if (/dslr/.test(m)) return "dslr";
  if (/mirrorless|mirror-less/.test(m)) return "mirrorless";
  if (/compact/.test(m)) return "compact";
  return "other";
}

export function buildCatalog({ htmlText, jsonText, overrides = {}, source }) {
  const html = htmlText ? parseCameraListHtml(htmlText) : { rows: [] };
  const jsonMap = jsonText ? parseCameraListJson(jsonText) : new Map();
  const rows = html.rows.length > 0 ? html.rows : [];
  const seen = new Set();
  const cameras = [];

  for (const row of rows) {
    const key = row.model.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const extra = jsonMap.get(key) ?? {};
    const abilities = abilitiesFromText(row.abilitiesText);
    const brand = brandOf(row.model, extra.vendor, overrides);
    cameras.push({
      id: row.model,
      model: row.model,
      raw_model: row.model,
      brand,
      camera_type: cameraTypeOf(row.model, brand, overrides),
      camlib: extra.camlib ?? "unknown",
      abilities,
      booth_support: boothSupportFromAbilities(abilities, row.hasAbilities === true),
      driver_status: row.hasAbilities ? driverStatusFromComment(row.comment) : "unknown",
      usb: {
        vendor: extra.vendor ?? null,
        product: extra.product ?? null,
      },
      notes: row.comment ?? "",
    });
  }

  cameras.sort(
    (a, b) => a.brand.localeCompare(b.brand, "en") || a.model.localeCompare(b.model, "en")
  );

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: {
      kind: source?.kind ?? "print-camera-list",
      url: source?.url ?? "",
      gphoto2_version: html.version ?? source?.version ?? "unknown",
      generated_at_source: new Date().toISOString(),
    },
    count: cameras.length,
    cameras,
  };
}

export function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object") return ["snapshot bukan objek"];
  if (!Array.isArray(snapshot.cameras)) return ["cameras bukan array"];
  if (snapshot.cameras.length < MIN_CAMERAS) {
    errors.push(`jumlah kamera ${snapshot.cameras.length} < ${MIN_CAMERAS}`);
  }
  if (snapshot.count !== snapshot.cameras.length) errors.push("count tidak cocok dengan cameras");
  const ids = new Set();
  for (const camera of snapshot.cameras) {
    if (!camera.model) errors.push("ada model kosong");
    if (ids.has(camera.id)) errors.push(`id duplikat: ${camera.id}`);
    ids.add(camera.id);
    if (!camera.brand) errors.push(`brand kosong: ${camera.id}`);
    if (!CAMERA_TYPES.includes(camera.camera_type)) {
      errors.push(`camera_type tidak valid: ${camera.id}`);
    }
    if (!BOOTH_SUPPORT.includes(camera.booth_support)) {
      errors.push(`booth_support tidak valid: ${camera.id}`);
    }
    if (!DRIVER_STATUS.includes(camera.driver_status)) {
      errors.push(`driver_status tidak valid: ${camera.id}`);
    }
  }
  return [...new Set(errors)].slice(0, 20);
}

function findPrintCameraList() {
  const configured = process.env.PRINT_CAMERA_LIST_BIN?.trim();
  if (configured && existsSync(configured)) return configured;
  try {
    const found = execFileSync("which", ["print-camera-list"], { encoding: "utf8" }).trim();
    if (found) return found;
  } catch {
    /* tidak ada di PATH */
  }
  for (const candidate of [
    "/usr/lib/libgphoto2/print-camera-list",
    "/usr/local/lib/libgphoto2/print-camera-list",
    "/opt/homebrew/lib/libgphoto2/print-camera-list",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function loadOverrides() {
  try {
    return JSON.parse(await readFile(OVERRIDES, "utf8"));
  } catch {
    return {};
  }
}

async function fromLocal(bin) {
  const jsonText = execFileSync(bin, ["json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const htmlText = execFileSync(bin, ["html"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return {
    jsonText,
    htmlText,
    source: { kind: "print-camera-list", url: "", version: undefined },
  };
}

async function fromWeb() {
  const urls = [
    "https://gphoto.org/proj/libgphoto2/support.php",
    "https://gphoto.github.io/proj/libgphoto2/support",
  ];
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return {
        htmlText: await response.text(),
        jsonText: "",
        source: { kind: "gphoto.org", url, version: undefined },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Semua sumber katalog gagal.");
}

function renderDoc(snapshot) {
  const byType = Object.fromEntries(CAMERA_TYPES.map((t) => [t, 0]));
  const bySupport = Object.fromEntries(BOOTH_SUPPORT.map((s) => [s, 0]));
  const byBrand = new Map();
  for (const camera of snapshot.cameras) {
    byType[camera.camera_type] += 1;
    bySupport[camera.booth_support] += 1;
    byBrand.set(camera.brand, (byBrand.get(camera.brand) ?? 0) + 1);
  }
  const topBrands = [...byBrand.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([brand, count]) => `| ${brand} | ${count} |`)
    .join("\n");
  return `# 17 — Kamera yang Didukung (gphoto2)

Snapshot publik katalog libgphoto2/gphoto2. Halaman web: \`/kamera\`.

- Sumber: ${snapshot.source.kind}${snapshot.source.url ? ` (${snapshot.source.url})` : ""}
- Versi libgphoto2: ${snapshot.source.gphoto2_version}
- Tanggal snapshot: ${snapshot.generated_at}
- Jumlah model: ${snapshot.count}

## Jumlah per tipe

${CAMERA_TYPES.map((type) => `- ${type}: ${byType[type]}`).join("\n")}

## Label kemampuan booth

- \`full\` — Siap booth (capture/trigger + liveview): ${bySupport.full}
- \`capture\` — Capture saja (tanpa liveview): ${bySupport.capture}
- \`transfer\` — Transfer file saja: ${bySupport.transfer}
- \`unknown\` — Belum terverifikasi: ${bySupport.unknown}

## Brand teratas

| Brand | Model |
|---|---|
${topBrands}

## Cara membaca label

\`booth_support\` diturunkan dari abilities resmi gphoto2, bukan uji perangkat.
Kamera PTP generik dapat tetap bekerja meski tidak tercantum; sebaliknya model
\`transfer\` hanya menjamin unduh file, bukan capture dari kiosk.

Atribusi: daftar berdasarkan libgphoto2/gphoto2 (LGPL). Snapshot dibuat oleh
\`npm run sync:cameras\`; periksa kesegaran dengan \`npm run sync:cameras -- --check\`.
`;
}

async function writeAtomic(file, content) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

async function checkSnapshot() {
  let raw;
  try {
    raw = await readFile(SNAPSHOT, "utf8");
  } catch {
    console.error("[sync:cameras] Snapshot tidak ada. Jalankan `npm run sync:cameras`.");
    process.exit(1);
  }
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    console.error("[sync:cameras] Snapshot rusak (JSON tidak valid).");
    process.exit(1);
  }
  const errors = validateSnapshot(snapshot);
  const generatedAt = Date.parse(snapshot?.generated_at ?? "");
  if (!Number.isFinite(generatedAt)) errors.push("generated_at tidak valid");
  else if (Date.now() - generatedAt > STALE_DAYS * 86_400_000) {
    errors.push(`snapshot lebih tua dari ${STALE_DAYS} hari`);
  }
  if (errors.length > 0) {
    console.error(`[sync:cameras] Snapshot tidak valid:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`[sync:cameras] OK · ${snapshot.count} kamera · ${snapshot.generated_at}`);
}

async function sync() {
  const overrides = await loadOverrides();
  let input;
  const bin = findPrintCameraList();
  if (bin) {
    input = await fromLocal(bin);
    console.log(`[sync:cameras] sumber lokal ${bin}`);
  } else {
    input = await fromWeb();
    console.log(`[sync:cameras] sumber web ${input.source.url}`);
  }

  const snapshot = buildCatalog({ ...input, overrides, source: input.source });
  const errors = validateSnapshot(snapshot);
  if (errors.length > 0) {
    console.error(`[sync:cameras] Katalog ditolak:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  await writeAtomic(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeAtomic(DOC, renderDoc(snapshot));
  console.log(`[sync:cameras] ${snapshot.count} kamera → ${SNAPSHOT}`);
}

export { SNAPSHOT, DOC, OVERRIDES, STALE_DAYS, MIN_CAMERAS };

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  if (process.argv.includes("--check")) await checkSnapshot();
  else await sync();
}
