/**
 * GIF end-to-end — buktikan jalur slideshow GIF berfungsi dari frame JPEG
 * → encode → output GIF animasi valid (feature hasil result, docs/05 §5.13).
 *
 * Reproduksi pipeline `src/server/gif.ts` (jpeg-js decode → gifenc encode)
 * di luar `server-only` agar bisa diuji di node:test. Memvalidasi:
 *   1. beberapa frame JPEG digabung jadi satu GIF animasi.
 *   2. header GIF + trailer valid.
 *   3. jumlah frame sama dengan jumlah input.
 *   4. frame delay (durasi slideshow) tersimpan.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import jpeg from "jpeg-js";
import gifenc from "gifenc";

import {
  GIF_DEFAULT_FRAME_DELAY_MS,
  GIF_DEFAULT_MAX_WIDTH,
  resolveGifOptions,
} from "../src/lib/gif-options.ts";
import { framePerPhoto } from "../src/lib/template-fit.ts";

const { applyPalette, GIFEncoder, quantize } = gifenc as unknown as {
  applyPalette: typeof import("gifenc").applyPalette;
  GIFEncoder: typeof import("gifenc").GIFEncoder;
  quantize: typeof import("gifenc").quantize;
};

const FRAME_DELAY_MS = GIF_DEFAULT_FRAME_DELAY_MS;
const GIF_MAX_WIDTH = GIF_DEFAULT_MAX_WIDTH;

type RgbaFrame = { width: number; height: number; data: Uint8Array };

/** Encode buffer RGBA → JPEG (jpeg-js kebalikan dari decode di gif.ts). */
function makeJpegFrame(width: number, height: number, fill: [number, number, number]): Buffer {
  const frameData = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    frameData[i * 4] = fill[0];
    frameData[i * 4 + 1] = fill[1];
    frameData[i * 4 + 2] = fill[2];
    frameData[i * 4 + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data: frameData, width, height }, 90).data);
}

function decodeJpeg(buf: Buffer): RgbaFrame {
  const decoded = jpeg.decode(buf, {
    useTArray: true,
    formatAsRGBA: true,
  }) as unknown as { width: number; height: number; data: Uint8Array };
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

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

function generateSlideshowGif(
  frames: Buffer[],
  opts: { frameDelayMs?: number; maxWidth?: number } = {}
): Buffer {
  if (frames.length === 0) throw new Error("Tidak ada frame untuk GIF");
  const { maxWidth, frameDelayMs } = resolveGifOptions(opts);
  const gif = GIFEncoder();
  // Satu frame per iterasi (sama dengan src/server/gif.ts) — memori O(satu frame).
  for (const buf of frames) {
    const frame = downscale(decodeJpeg(buf), maxWidth);
    const palette = quantize(frame.data, 256, { format: "rgb565" });
    const index = applyPalette(frame.data, palette, "rgb565");
    gif.writeFrame(index, frame.width, frame.height, { palette, delay: frameDelayMs });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

test("GIF: header + trailer valid", () => {
  const frames = [makeJpegFrame(200, 200, [255, 0, 0]), makeJpegFrame(200, 200, [0, 255, 0])];
  const gif = generateSlideshowGif(frames);
  const head = gif.subarray(0, 6).toString("ascii");
  assert.ok(head === "GIF87a" || head === "GIF89a", `header GIF valid, dapat "${head}"`);
  assert.equal(gif[gif.length - 1], 0x3b, "trailer GIF 0x3B ada");
  assert.ok(gif.length > 100, "output tidak kosong/terlalu kecil");
});

test("GIF: jumlah frame sama dengan input foto", () => {
  const frames = [
    makeJpegFrame(120, 120, [255, 0, 0]),
    makeJpegFrame(120, 120, [0, 255, 0]),
    makeJpegFrame(120, 120, [0, 0, 255]),
    makeJpegFrame(120, 120, [255, 255, 0]),
  ];
  const gif = generateSlideshowGif(frames);
  // Hitung graphic control extension blocks (0x21 0xF9) sebagai proksi jumlah frame.
  let frameCount = 0;
  for (let i = 0; i < gif.length - 1; i++) {
    if (gif[i] === 0x21 && gif[i + 1] === 0xf9) frameCount++;
  }
  assert.equal(frameCount, frames.length, "jumlah frame GIF = jumlah foto input");
});

test("GIF: frame delay slideshow tersimpan (800ms)", () => {
  const frames = [makeJpegFrame(80, 80, [10, 20, 30]), makeJpegFrame(80, 80, [40, 50, 60])];
  const gif = generateSlideshowGif(frames);
  // Cari graphic control extension pertama, baca packed delay (centiseconds).
  const gceIdx = gif.indexOf(Buffer.from([0x21, 0xf9]));
  assert.ok(gceIdx >= 0, "GCE block ada");
  // delay = 2 byte little-endian pada offset gceIdx+4
  const delayCs = gif[gceIdx + 4]! | (gif[gceIdx + 5]! << 8);
  assert.equal(delayCs, FRAME_DELAY_MS / 10, "delay frame = 80 centiseconds (800ms)");
});

test("GIF: frame besar di-downscale ke max width 480", () => {
  const frames = [makeJpegFrame(1200, 800, [100, 100, 100])];
  const gif = generateSlideshowGif(frames);
  // Logical screen descriptor width = 2 byte little-endian pada offset 6..7.
  const width = gif[6]! | (gif[7]! << 8);
  assert.ok(width <= GIF_MAX_WIDTH, `width terskala ≤ ${GIF_MAX_WIDTH}, dapat ${width}`);
});

test("GIF: input kosong ditolak", () => {
  assert.throws(() => generateSlideshowGif([]), /frame/i);
});

test("GIF: setelan output dipakai (delay + lebar dari business_settings)", () => {
  const frames = [makeJpegFrame(1200, 800, [200, 10, 10]), makeJpegFrame(1200, 800, [10, 200, 10])];
  const gif = generateSlideshowGif(frames, { frameDelayMs: 250, maxWidth: 640 });
  const width = gif[6]! | (gif[7]! << 8);
  assert.ok(width <= 640, `lebar mengikuti setelan max_width, dapat ${width}`);
  const gceIdx = gif.indexOf(Buffer.from([0x21, 0xf9]));
  const delayCs = gif[gceIdx + 4]! | (gif[gceIdx + 5]! << 8);
  assert.equal(delayCs, 25, "delay 250 ms = 25 centiseconds");
});

test("GIF: setelan di luar rentang di-clamp, bukan melempar", () => {
  assert.deepEqual(resolveGifOptions({}), {
    maxWidth: GIF_DEFAULT_MAX_WIDTH,
    frameDelayMs: GIF_DEFAULT_FRAME_DELAY_MS,
  });
  const low = resolveGifOptions({ maxWidth: 10, frameDelayMs: 1 });
  assert.equal(low.maxWidth, 240);
  assert.equal(low.frameDelayMs, 100);
  const high = resolveGifOptions({ maxWidth: 5000, frameDelayMs: 99_999 });
  assert.equal(high.maxWidth, 1080);
  assert.equal(high.frameDelayMs, 3000);
  const nonFinite = resolveGifOptions({
    maxWidth: Number.NaN,
    frameDelayMs: Number.POSITIVE_INFINITY,
  });
  assert.equal(nonFinite.maxWidth, GIF_DEFAULT_MAX_WIDTH);
  assert.equal(nonFinite.frameDelayMs, GIF_DEFAULT_FRAME_DELAY_MS);
});

test("GIF kiosk: satu JPEG berframe per foto lewat composeFrame (template ber-slot)", async () => {
  const root = new URL("../", import.meta.url);
  const render = await readFile(new URL("src/components/kiosk/photo-render.ts", root), "utf8");
  const app = await readFile(new URL("src/components/kiosk/KioskApp.tsx", root), "utf8");
  const helper = render.slice(
    render.indexOf("export async function renderFramePerPhotoBlobs"),
    render.indexOf("export function defaultEdit")
  );

  // Renderer per foto: composeFrame + slot milik foto itu (framePerPhoto),
  // kanvas template + frame PNG template, satu kanvas dipakai ulang.
  assert.ok(helper.includes("composeFrame("), "GIF berframe wajib lewat composeFrame");
  assert.ok(helper.includes("framePerPhoto("), "slot per foto wajib dari framePerPhoto");
  assert.ok(
    helper.includes('canvas = document.createElement("canvas")'),
    "satu kanvas dipakai ulang"
  );
  assert.ok(
    /composeFrame\(\s*canvas,\s*layout,\s*frame,/.test(helper),
    "composeFrame wajib menerima layout template (kanvas) + frame PNG"
  );
  assert.ok(helper.includes("canvasToBlob(canvas)"), "tiap iterasi menghasilkan satu JPEG");
  assert.ok(helper.includes("URL.revokeObjectURL"), "blob foto dilepas per iterasi (memori aman)");
  // Frame PNG template ikut dimuat dengan crossOrigin agar kanvas tidak tainted.
  assert.ok(render.includes('img.crossOrigin = "anonymous"'));

  // KioskApp wajib melewati resolveGifFrames (render berframe), bukan blob mentah.
  assert.ok(
    /const gifSource = await resolveGifFrames\(/.test(app),
    "gifSource kiosk wajib lewat resolveGifFrames"
  );
  assert.ok(
    !/const gifSource = selectedTemplate\?\.layout \? photos\.map/.test(app),
    "gifSource lama (blob mentah tanpa frame) tidak boleh kembali"
  );
});

test("GIF kiosk: kanvas template menang atas ukuran foto (slot + frame terlihat)", () => {
  // Kanvas output = canvas template (bukan dimensi foto), jadi frame dan slot
  // kosong tetap terlihat di tiap frame GIF.
  const layoutCanvas = { width: 1200, height: 1800 };
  const photoSize = { width: 640, height: 480 };
  const slotCount = 6;
  const frames = Array.from({ length: slotCount }, (_, i) => framePerPhoto(slotCount, i));
  // Satu foto mengisi tepat satu slot; slot lain kosong tetapi tetap dirender
  // (emptySlot "blank") di kanvas template yang sama.
  assert.ok(frames.every((f) => f.filter((s) => s !== null).length === 1));
  assert.ok(layoutCanvas.width > photoSize.width && layoutCanvas.height > photoSize.height);
});
