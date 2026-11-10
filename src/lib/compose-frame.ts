/**
 * Composite engine — docs/15 §15.4. Dipakai bersama builder preview dan editor
 * kiosk. JPEG final dirender di editor kiosk; print dan result online memakai
 * JPEG itu, tanpa render ulang di server.
 *
 * Urutan render: isian dasar kanvas → slot (z naik, foto cover-fit + transform
 * customer) → frame PNG full-canvas di atas → overlay teks/stiker paling atas.
 */

import type { KioskOverlay } from "@/lib/kiosk-types";
import {
  canvasBackground,
  slotsByZ,
  slotPlacement,
  type LayoutSlot,
  type TemplateLayout,
} from "@/lib/template-layout";
import { drawSlotText } from "./slot-text.ts";
import { defaultBrandColors } from "./brand-defaults";

/** Sumber gambar engine ini: foto jadi, offscreen canvas, atau frame <video>
 *  hidup (preview frame saat sesi foto — slot aktif menampilkan kamera). */
export type ComposeSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

function sourceSize(src: ComposeSource): { w: number; h: number } {
  if (src instanceof HTMLCanvasElement) return { w: src.width, h: src.height };
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth || 1, h: src.videoHeight || 1 };
  return { w: src.naturalWidth || 1, h: src.naturalHeight || 1 };
}

/** Clip path bentuk slot (rect/rounded/circle/ellipse/mask) dalam koordinat canvas.
 *  Diekspor agar builder menggambar outline slot dengan bentuk identik. */
export function slotClipPath(ctx: CanvasRenderingContext2D, slot: LayoutSlot, scale: number): void {
  const x = slot.x * scale;
  const y = slot.y * scale;
  const w = slot.width * scale;
  const h = slot.height * scale;
  const radius = Math.min(slot.radius ?? 0, Math.min(slot.width, slot.height) / 2) * scale;
  ctx.beginPath();
  if (slot.shape === "mask" && slot.points && slot.points.length >= 3) {
    const points = slot.points;
    ctx.moveTo(x + points[0]!.x * scale, y + points[0]!.y * scale);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(x + points[i]!.x * scale, y + points[i]!.y * scale);
    }
    ctx.closePath();
  } else if (slot.shape === "circle" || slot.shape === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (slot.shape === "rounded" && radius > 0) {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/** Satu overlay teks/stiker pada koordinat ternormalisasi 0..1. */
function drawOverlay(ctx: CanvasRenderingContext2D, o: KioskOverlay, w: number, h: number): void {
  const sizePx = o.size * h;
  ctx.save();
  ctx.translate(o.x * w, o.y * h);
  ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (o.kind === "text") {
    ctx.fillStyle = o.color;
    ctx.font = `700 ${sizePx}px "Archivo Black", "IBM Plex Sans", sans-serif`;
  } else {
    ctx.fillStyle = o.color || defaultBrandColors.ink;
    ctx.font = `${sizePx}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  }
  ctx.fillText(o.content, 0, 0);
  ctx.restore();
}

/** Overlay digambar setelah frame supaya teks/stiker tidak terpotong slot. */
export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: readonly KioskOverlay[] | undefined,
  w: number,
  h: number
): void {
  for (const o of overlays ?? []) drawOverlay(ctx, o, w, h);
}

type ComposeOptions = {
  /** Teks/stiker customer — layer teratas, di atas frame. */
  overlays?: readonly KioskOverlay[];
  /** Slot kosong: "cross" = penanda diagnostik builder (default),
   *  "blank" = isian redup tanpa silang (preview sesi foto customer). */
  emptySlot?: "cross" | "blank";
};

/**
 * composeFrame — render layout + foto + frame ke canvas.
 * `photos` diindeks urut z naik (mapping photos.order_index i → slot ke-i).
 * `maxW` membatasi lebar output (preview); Infinity untuk resolusi penuh.
 * Frame digambar DI ATAS foto (docs/15 §15.1; ponytail: frame_z configurable
 * saat dibutuhkan).
 */
export function composeFrame(
  canvas: HTMLCanvasElement,
  layout: TemplateLayout,
  frameImg: ComposeSource | null,
  photos: (ComposeSource | null)[],
  transforms: { zoom?: number; panX?: number; panY?: number }[] = [],
  maxW = Number.POSITIVE_INFINITY,
  options: ComposeOptions = {}
): void {
  const scale = Math.min(1, maxW / layout.canvas.width);
  canvas.width = Math.max(1, Math.round(layout.canvas.width * scale));
  canvas.height = Math.max(1, Math.round(layout.canvas.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Isian dasar: lubang alpha frame harus punya warna,
  // bukan transparan (output final JPEG → transparan tercetak hitam).
  ctx.fillStyle = canvasBackground(layout);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  slotsByZ(layout).forEach((slot, i) => {
    const src = photos[i] ?? null;
    ctx.save();
    // Rotasi pivot center slot (docs/15 §15.2).
    const cx = (slot.x + slot.width / 2) * scale;
    const cy = (slot.y + slot.height / 2) * scale;
    ctx.translate(cx, cy);
    ctx.rotate((slot.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);

    slotClipPath(ctx, slot, scale);
    ctx.clip();

    if (src) {
      const { w: imgW, h: imgH } = sourceSize(src);
      const p = slotPlacement(slot, imgW, imgH, transforms[i] ?? {});
      ctx.drawImage(src, p.x * scale, p.y * scale, p.drawW * scale, p.drawH * scale);
    } else {
      // Slot kosong: isi redup (preview builder memakai silang diagnostik).
      ctx.fillStyle = defaultBrandColors.muted;
      ctx.fillRect(slot.x * scale, slot.y * scale, slot.width * scale, slot.height * scale);
      if (options.emptySlot !== "blank") {
        ctx.strokeStyle = defaultBrandColors.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(slot.x * scale, slot.y * scale);
        ctx.lineTo((slot.x + slot.width) * scale, (slot.y + slot.height) * scale);
        ctx.moveTo((slot.x + slot.width) * scale, slot.y * scale);
        ctx.lineTo(slot.x * scale, (slot.y + slot.height) * scale);
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  if (frameImg) {
    ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
  }
  // Teks template di atas frame: teks final harus terlihat di JPEG, bukan
  // tertutup PNG frame. Layout tanpa `properties.text` tidak menggambar apa pun.
  for (const slot of slotsByZ(layout)) drawSlotText(ctx, slot, scale);

  drawOverlays(ctx, options.overlays, canvas.width, canvas.height);
}
