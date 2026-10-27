import "server-only";

/**
 * Compose server-side — padanan `src/Collage.php` + `src/Image.php`
 * (PhotoboothProject, berbasis GD) dan pipeline Pillow (photobooth-app), di atas
 * `sharp`.
 *
 * Sengaja MEMAKAI ULANG logika murni yang sudah ada, bukan menyalinnya:
 * - geometri slot + cover-fit  → `src/lib/template-layout.ts`
 * - chroma key (alpha + tepi lembut) → `src/lib/chroma-key.ts`
 * - katalog filter → `./filters.ts`
 * Jadi tidak ada dua rumus tata letak atau dua rumus chroma key yang bisa drift.
 *
 * Batasan yang DIAKUI (dilaporkan di `limited`, bukan disembunyikan):
 * - `slot.rotation ≠ 0`: isi foto ikut diputar, tetapi bentuk clip tetap
 *   sumbu-lurus. Klien memutar clip-nya juga, jadi hasil bisa sedikit berbeda.
 * - overlay teks memakai font yang tersedia di server; bentuk huruf bisa
 *   berbeda dari kanvas klien.
 */

import type { KioskOverlay } from "@/lib/kiosk-types";
import { defaultBrandColors } from "@/lib/brand-defaults";
import { applyChromaKey, sampleCornerColor } from "@/lib/chroma-key";
import {
  canvasBackground,
  layoutSchema,
  slotPlacement,
  slotsByZ,
  type LayoutSlot,
  type SlotTransform,
  type TemplateLayout,
} from "@/lib/template-layout";
import { applyFilterPlan, normalizeFilterId, type FilterId } from "@/server/media/filters";

export type ComposePhoto = {
  /** JPEG/PNG mentah dari kamera (belum dikomposit). */
  buffer: Buffer;
  /** Zoom/pan customer untuk slot ini. */
  transform?: SlotTransform;
  filter?: FilterId | string | null;
};

export type ComposeRequest = {
  layout: unknown;
  /** PNG frame transparan (opsional). */
  frame?: Buffer | null;
  /** Urut z naik; `null` = slot kosong. */
  photos: (ComposePhoto | null)[];
  /** Buat latar kunci transparan (diambil dari warna sudut foto). */
  chromaKey?: boolean;
  overlays?: readonly KioskOverlay[];
  /** Batas lebar output (preview). Kosong = resolusi penuh layout. */
  maxWidth?: number | null;
  jpegQuality?: number;
};

export type ComposeResult = {
  buffer: Buffer;
  width: number;
  height: number;
  /** Perkiraan yang dipakai (informasional). */
  limitations: string[];
};

function parseHexColor(value: string, fallback = { r: 255, g: 255, b: 255 }): {
  r: number;
  g: number;
  b: number;
} {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return fallback;
  const int = Number.parseInt(match[1]!, 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

/** EXIF orientation 5..8 menukar lebar/tinggi — browser sudah menerapkannya,
 *  jadi matematika cover-fit harus memakai dimensi yang sudah berorientasi. */
function orientedSize(
  width: number | undefined,
  height: number | undefined,
  orientation: number | undefined
): { w: number; h: number } {
  const w = Math.max(1, width ?? 1);
  const h = Math.max(1, height ?? 1);
  if (orientation && orientation >= 5 && orientation <= 8) return { w: h, h: w };
  return { w, h };
}

/** Mask bentuk slot: putih di dalam, hitam di luar (satu kanal 8-bit). */
async function shapeMask(slot: LayoutSlot, width: number, height: number): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const shape =
    slot.shape === "circle" || slot.shape === "ellipse"
      ? `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="#fff"/>`
      : slot.shape === "rounded" && (slot.radius ?? 0) > 0
        ? `<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.min(
            (slot.radius ?? 0) * (width / Math.max(1, slot.width)),
            Math.min(width, height) / 2
          )}" fill="#fff"/>`
        : `<rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/>${shape}</svg>`;
  const raw = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer();
  return new Uint8Array(raw);
}

/** Overlay teks/stiker sebagai satu SVG full-canvas (layer paling atas). */
function overlaysSvg(
  overlays: readonly KioskOverlay[],
  width: number,
  height: number
): string {
  const parts = overlays.map((o) => {
    const size = Math.max(1, o.size * height);
    const x = o.x * width;
    const y = o.y * height;
    const family =
      o.kind === "text"
        ? "Archivo Black, IBM Plex Sans, DejaVu Sans, sans-serif"
        : "Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji, sans-serif";
    const escaped = o.content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="700" fill="${o.color || defaultBrandColors.ink}" text-anchor="middle" dominant-baseline="central" transform="rotate(${o.rotation} ${x} ${y})">${escaped}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("")}</svg>`;
}

/** Satu slot → RGBA pada ukuran slot, alpha = alpha foto × bentuk slot. */
async function slotLayer(input: {
  photo: ComposePhoto;
  slot: LayoutSlot;
  scale: number;
  chromaKey: boolean;
}): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const { photo, slot, scale } = input;

  const meta = await sharp(photo.buffer, { failOn: "none" }).metadata();
  const source = orientedSize(meta.width, meta.height, meta.orientation);
  const placement = slotPlacement(slot, source.w, source.h, photo.transform);

  const drawW = Math.max(1, Math.round(placement.drawW * scale));
  const drawH = Math.max(1, Math.round(placement.drawH * scale));

  let pipeline = sharp(photo.buffer, { failOn: "none" }).rotate();
  if (slot.rotation) {
    pipeline = pipeline.rotate(slot.rotation, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  pipeline = applyFilterPlan(pipeline, normalizeFilterId(photo.filter));
  pipeline = pipeline.resize({ width: drawW, height: drawH, fit: "fill" });

  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (input.chromaKey) {
    const key = sampleCornerColor(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      info.width,
      info.height
    );
    applyChromaKey(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      { key, tolerance: 90, softness: 0.25 }
    );
  }

  const slotW = Math.max(1, Math.round(slot.width * scale));
  const slotH = Math.max(1, Math.round(slot.height * scale));
  const offsetX = Math.round((placement.x - slot.x) * scale);
  const offsetY = Math.round((placement.y - slot.y) * scale);
  const mask = await shapeMask(slot, slotW, slotH);

  const out = Buffer.alloc(slotW * slotH * 4);
  for (let y = 0; y < slotH; y += 1) {
    const sourceY = y - offsetY;
    if (sourceY < 0 || sourceY >= info.height) continue;
    for (let x = 0; x < slotW; x += 1) {
      const sourceX = x - offsetX;
      if (sourceX < 0 || sourceX >= info.width) continue;
      const dest = (y * slotW + x) * 4;
      const src = (sourceY * info.width + sourceX) * info.channels;
      out[dest] = data[src]!;
      out[dest + 1] = data[src + 1]!;
      out[dest + 2] = data[src + 2]!;
      out[dest + 3] = Math.round(((data[src + 3] ?? 255) * (mask[y * slotW + x] ?? 0)) / 255);
    }
  }

  return sharp(out, { raw: { width: slotW, height: slotH, channels: 4 } }).png().toBuffer();
}

/** Kotak kosong: warna redup yang sama dengan klien, tanpa silang diagnostik. */
async function emptySlotLayer(slot: LayoutSlot, scale: number): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const width = Math.max(1, Math.round(slot.width * scale));
  const height = Math.max(1, Math.round(slot.height * scale));
  const color = parseHexColor(defaultBrandColors.muted, { r: 200, g: 200, b: 200 });
  return sharp({
    create: { width, height, channels: 4, background: { ...color, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

export async function composeLayout(input: ComposeRequest): Promise<ComposeResult> {
  const { default: sharp } = await import("sharp");
  const parsed = layoutSchema.safeParse(input.layout);
  if (!parsed.success) {
    throw new Error("Layout tidak valid untuk komposisi server.");
  }
  const layout: TemplateLayout = parsed.data;

  const scale = input.maxWidth ? Math.min(1, input.maxWidth / layout.canvas.width) : 1;
  const width = Math.max(1, Math.round(layout.canvas.width * scale));
  const height = Math.max(1, Math.round(layout.canvas.height * scale));

  const limitations: string[] = [];
  const slots = slotsByZ(layout);
  if (slots.some((slot) => slot.rotation !== 0)) limitations.push("slot.rotation");
  if ((input.overlays?.length ?? 0) > 0) limitations.push("overlay-font");

  const layers: { input: Buffer; left: number; top: number }[] = [];
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]!;
    const photo = input.photos[index] ?? null;
    const left = Math.round(slot.x * scale);
    const top = Math.round(slot.y * scale);
    if (photo) {
      layers.push({
        input: await slotLayer({ photo, slot, scale, chromaKey: input.chromaKey === true }),
        left,
        top,
      });
    } else {
      limitations.push("empty-slot");
      layers.push({ input: await emptySlotLayer(slot, scale), left, top });
    }
  }

  if (input.frame) {
    layers.push({
      input: await sharp(input.frame, { failOn: "none" })
        .resize({ width, height, fit: "fill" })
        .png()
        .toBuffer(),
      left: 0,
      top: 0,
    });
  }

  if (input.overlays?.length) {
    layers.push({
      input: await sharp(Buffer.from(overlaysSvg(input.overlays, width, height)))
        .png()
        .toBuffer(),
      left: 0,
      top: 0,
    });
  }

  const background = parseHexColor(canvasBackground(layout));
  const buffer = await sharp({
    create: { width, height, channels: 4, background: { ...background, alpha: 1 } },
  })
    .composite(layers)
    .jpeg({ quality: Math.min(100, Math.max(40, input.jpegQuality ?? 92)), chromaSubsampling: "4:4:4" })
    .toBuffer();

  return {
    buffer,
    width,
    height,
    limitations: [...new Set(limitations)],
  };
}
