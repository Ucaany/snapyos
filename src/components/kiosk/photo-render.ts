import { FILTER_PRESETS, type KioskOverlay, type PhotoEdit } from "@/lib/kiosk-types";
import { drawOverlays } from "@/lib/compose-frame";
import {
  applyChromaKey,
  DEFAULT_CHROMA_KEY,
  sampleCornerColor,
  type ChromaKeyOptions,
} from "@/lib/chroma-key";
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat foto"));
    img.src = url;
  });
}

function normRot(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/**
 * Salinan gambar dengan latar kunci dibuat transparan. Warna kunci diambil
 * dari piksel sudut foto (layar hijau bisa berbeda karena pencahayaan booth),
 * lalu diterapkan ke salinan offscreen — gambar asli tidak dimutasi agar
 * preview dan hasil akhir konsisten.
 */
export type ChromaStatus = { applied: boolean; tainted: boolean };

type ChromaResult = ChromaStatus & { source: CanvasImageSource };

/**
 * Salinan gambar dengan latar kunci dibuat transparan. Warna kunci diambil
 * dari piksel sudut foto (layar hijau bisa berbeda karena pencahayaan booth),
 * lalu diterapkan ke salinan offscreen — gambar asli tidak dimutasi agar
 * preview dan hasil akhir konsisten.
 *
 * `maxW` terbatas → diproses di resolusi preview; `Infinity` → resolusi penuh.
 */
function chromaPreparedImage(
  img: HTMLImageElement,
  options: boolean | ChromaKeyOptions,
  maxW = Number.POSITIVE_INFINITY
): ChromaResult {
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const scale = Number.isFinite(maxW) ? Math.min(1, maxW / w) : 1;
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { source: img, applied: false, tainted: false };
  ctx.drawImage(img, 0, 0, cw, ch);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, cw, ch);
  } catch {
    // Canvas tainted (cross-origin tanpa CORS) — jangan gagalkan render.
    return { source: img, applied: false, tainted: true };
  }
  const config: ChromaKeyOptions =
    options === true
      ? { ...DEFAULT_CHROMA_KEY, key: sampleCornerColor(data.data, cw, ch) }
      : { ...DEFAULT_CHROMA_KEY, ...options };
  if (applyChromaKey(data.data, config, { width: cw, height: ch }) === 0) {
    return { source: img, applied: false, tainted: false };
  }
  ctx.putImageData(data, 0, 0);
  return { source: canvas, applied: true, tainted: false };
}

/** Overlay teks/stiker di atas canvas yang sudah final (frame included). */
export function drawOverlayLayer(canvas: HTMLCanvasElement, overlays: readonly KioskOverlay[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawOverlays(ctx, overlays, canvas.width, canvas.height);
}

/**
 * Gambar foto + editan ke canvas. maxW membatasi lebar output (preview);
 * pass Infinity untuk resolusi penuh (final render).
 *
 * Overlay teks/stiker TIDAK digambar di sini: layer itu harus di atas frame
 * (`drawOverlayLayer`), bukan di dalam foto yang ter-clip slot.
 */
export function drawPhoto(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  edit: PhotoEdit,
  maxW = 640,
  /** Aktif → warna latar (diambil dari sudut foto) dibuat transparan. */
  chroma: boolean | ChromaKeyOptions = false,
  /** Warna dasar di bawah piksel transparan. Kosong = biarkan transparan —
   *  jalur slot mengandalkan `composeFrame` mengisi latar, jadi mengisi di sini
   *  akan menutup lubang chroma. */
  background?: string
): ChromaStatus {
  const prepared = chroma
    ? chromaPreparedImage(img, chroma, maxW)
    : null;
  const status: ChromaStatus = {
    applied: prepared?.applied ?? false,
    tainted: prepared?.tainted ?? false,
  };
  const source = prepared?.source ?? img;
  const rot = normRot(edit.adjust.rotation);
  const swap = rot === 90 || rot === 270;
  const srcW = img.naturalWidth || 1;
  const srcH = img.naturalHeight || 1;
  const outW = swap ? srcH : srcW;
  const outH = swap ? srcW : srcH;

  const scale = Math.min(1, maxW / outW);
  const cw = Math.max(1, Math.round(outW * scale));
  const ch = Math.max(1, Math.round(outH * scale));
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return status;

  // Chroma key membuat piksel berlubang; jalur legacy (foto full-canvas tanpa
  // composeFrame) perlu isian dasar agar hasil JPEG tidak menghitam.
  if (chroma && background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, cw, ch);
  }

  const base = FILTER_PRESETS.find((f) => f.id === edit.adjust.filter)?.css ?? "none";
  const a = edit.adjust;
  const adjustments = [
    `brightness(${Math.max(0, a.brightness ?? 1)})`,
    `contrast(${Math.max(0, a.contrast ?? 1)})`,
    `saturate(${Math.max(0, a.saturation ?? 1)})`,
    a.blur ? `blur(${Math.max(0, a.blur)}px)` : "",
  ]
    .filter(Boolean)
    .join(" ");
  ctx.filter = [base, adjustments].filter(Boolean).join(" ") || "none";

  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(edit.adjust.zoom, edit.adjust.zoom);
  ctx.scale(scale, scale);
  ctx.translate(-srcW / 2 + edit.adjust.panX, -srcH / 2 + edit.adjust.panY);
  ctx.drawImage(source, 0, 0, srcW, srcH);
  ctx.restore();

  ctx.filter = "none";
  if ((a.grain ?? 0) > 0) {
    const amount = Math.min(1, Math.max(0, a.grain));
    const noise = document.createElement("canvas");
    noise.width = cw;
    noise.height = ch;
    const nctx = noise.getContext("2d");
    if (nctx) {
      const image = nctx.createImageData(cw, ch);
      for (let i = 0; i < image.data.length; i += 4) {
        const value = Math.floor(Math.random() * 256);
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = Math.round(amount * 42);
      }
      nctx.putImageData(image, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.drawImage(noise, 0, 0);
      ctx.restore();
    }
  }
  if ((a.vignette ?? 0) > 0) {
    const amount = Math.min(1, Math.max(0, a.vignette));
    const gradient = ctx.createRadialGradient(
      cw / 2,
      ch / 2,
      Math.min(cw, ch) * 0.25,
      cw / 2,
      ch / 2,
      Math.max(cw, ch) * 0.72
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${amount * 0.75})`);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }
  return status;
}

/**
 * Gambar frame PNG penuh di atas isi canvas (template legacy tanpa slot,
 * docs/15 §15.1: frame selalu DI ATAS foto). No-op bila frame belum termuat —
 * pemanggil sudah memvalidasinya sebelum render.
 */
export function drawFrameOverlay(canvas: HTMLCanvasElement, frame: HTMLImageElement | null): void {
  if (!frame) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
}

/** Foto + editan, lalu frame legacy digambar penuh di atasnya, lalu overlay
 *  teks/stiker paling atas (docs/05 §5.9). Dipakai jalur final tanpa slot. */
export async function renderFramedPhotoBlob(
  blob: Blob,
  edit: PhotoEdit,
  frame: HTMLImageElement | null,
  chroma: boolean | ChromaKeyOptions = false,
  background = "#ffffff"
): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    drawPhoto(canvas, img, edit, Number.POSITIVE_INFINITY, chroma, background);
    drawFrameOverlay(canvas, frame);
    drawOverlayLayer(canvas, edit.overlays);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Canvas → Blob JPEG. */
export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Gagal menyimpan foto"))),
      "image/jpeg",
      quality
    );
  });
}

export function defaultEdit(): PhotoEdit {
  return {
    adjust: {
      filter: "original",
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 0,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      blur: 0,
      grain: 0,
      vignette: 0,
    },
    overlays: [],
  };
}
