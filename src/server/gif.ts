/**
 * GIF slideshow server-side — docs/05 §5.13 (digenerate saat finalize).
 * Decode JPEG (jpeg-js) → downscale → quantize → encode (gifenc).
 */

import "server-only";
import jpeg from "jpeg-js";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { resolveGifOptions, type GifOptions } from "@/lib/gif-options";

export type { GifOptions };

type RgbaFrame = { width: number; height: number; data: Uint8Array };

function decodeJpeg(buf: Buffer): RgbaFrame {
  const decoded = jpeg.decode(buf, {
    useTArray: true,
    formatAsRGBA: true,
    maxMemoryUsageInMB: 256,
  }) as unknown as { width: number; height: number; data: Uint8Array };
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

/** Bilinear downscale ke maxW (hemat memori + ukuran GIF). */
function downscale(src: RgbaFrame, maxW: number): RgbaFrame {
  const { width: srcW, height: srcH, data } = src;
  if (srcW <= maxW) return src;

  const scale = maxW / srcW;
  const dstW = maxW;
  const dstH = Math.max(1, Math.round(srcH * scale));
  const out = new Uint8Array(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    const sy = (y + 0.5) / scale - 0.5;
    const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));
    const fy = Math.max(0, Math.min(1, sy - Math.floor(sy)));
    for (let x = 0; x < dstW; x++) {
      const sx = (x + 0.5) / scale - 0.5;
      const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
      const fx = Math.max(0, Math.min(1, sx - Math.floor(sx)));

      const i00 = (y0 * srcW + x0) * 4;
      const i01 = (y0 * srcW + x1) * 4;
      const i10 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      const di = (y * dstW + x) * 4;

      for (let c = 0; c < 4; c++) {
        const top = data[i00 + c]! * (1 - fx) + data[i01 + c]! * fx;
        const bot = data[i10 + c]! * (1 - fx) + data[i11 + c]! * fx;
        out[di + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }
  return { width: dstW, height: dstH, data: out };
}

/** Generate GIF animasi slideshow dari buffer JPEG (urutan = urutan frames).
 *  Dekode + downscale + quantize SATU frame per iterasi lalu lepas buffer-nya —
 *  puncak memori O(satu frame) bukan O(semua frame) (cegah OOM sesi banyak foto).
 *  `opts` = acuan `business_settings.output.gif` (delay & lebar); nilai di luar
 *  rentang di-clamp, bukan melempar, supaya setelan lama/rusak tidak mematikan
 *  output digital. */
export function generateSlideshowGif(frames: Buffer[], opts: GifOptions = {}): Buffer {
  if (frames.length === 0) throw new Error("Tidak ada frame untuk GIF");

  const { maxWidth, frameDelayMs: delay } = resolveGifOptions(opts);

  const gif = GIFEncoder();
  for (const buf of frames) {
    const frame = downscale(decodeJpeg(buf), maxWidth);
    const palette = quantize(frame.data, 256, { format: "rgb565" });
    const index = applyPalette(frame.data, palette, "rgb565");
    gif.writeFrame(index, frame.width, frame.height, { palette, delay });
    // `frame` (RGBA penuh) keluar scope tiap iterasi → GC bebas sebelum frame
    // berikutnya didekode. `buf` (JPEG asli) dipegang pemanggil.
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}
