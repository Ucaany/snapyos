import {
  FILTER_PRESETS,
  type KioskOverlay,
  type PhotoEdit,
} from "@/lib/kiosk-types";
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

function drawOverlay(ctx: CanvasRenderingContext2D, o: KioskOverlay, w: number, h: number) {
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
    ctx.fillStyle = o.color || "#111111";
    ctx.font = `${sizePx}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  }
  ctx.fillText(o.content, 0, 0);
  ctx.restore();
}

/**
 * Gambar foto + editan ke canvas. maxW membatasi lebar output (preview);
 * pass Infinity untuk resolusi penuh (final render).
 */
export function drawPhoto(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  edit: PhotoEdit,
  maxW = 640
): void {
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
  if (!ctx) return;

  const base = FILTER_PRESETS.find((f) => f.id === edit.adjust.filter)?.css ?? "none";
  const a = edit.adjust;
  const adjustments = [
    `brightness(${Math.max(0, a.brightness ?? 1)})`,
    `contrast(${Math.max(0, a.contrast ?? 1)})`,
    `saturate(${Math.max(0, a.saturation ?? 1)})`,
    a.blur ? `blur(${Math.max(0, a.blur)}px)` : "",
  ].filter(Boolean).join(" ");
  ctx.filter = [base, adjustments].filter(Boolean).join(" ") || "none";

  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(edit.adjust.zoom, edit.adjust.zoom);
  ctx.scale(scale, scale);
  ctx.translate(-srcW / 2 + edit.adjust.panX, -srcH / 2 + edit.adjust.panY);
  ctx.drawImage(img, 0, 0, srcW, srcH);
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
    const gradient = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${amount * 0.75})`);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }
  for (const o of edit.overlays) drawOverlay(ctx, o, cw, ch);
}

/** Render blob foto + editan → Blob JPEG (resolusi penuh). Menghindari
 *  base64 sepenuhnya (tak ada toDataURL → tak ada data URL besar di memori). */
export async function renderPhotoBlob(blob: Blob, edit: PhotoEdit): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    drawPhoto(canvas, img, edit, Number.POSITIVE_INFINITY);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Canvas → Blob JPEG (fallback ke data URL bila toBlob tak tersedia). */
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
