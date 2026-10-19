"use client";

/**
 * Adapter DOM: Blob foto → bitmap 1bpp siap raster ESC/POS.
 * Dekode memakai `createImageBitmap` (bukan <img>) agar tidak menyentuh layout
 * dan bisa jalan saat layar cetak sedang menampilkan progress.
 */

import { floydSteinberg, rgbaToGray, type MonoBitmap } from "@/lib/print/dither";

/**
 * @param blob hasil akhir (JPEG komposit / foto berframe)
 * @param widthDots lebar kertas printer (384 untuk 58mm, 576 untuk 80mm)
 * @param maxHeightDots batas tinggi agar satu lembar tidak terlalu panjang
 */
export async function rasterizePhoto(
  blob: Blob,
  widthDots: number,
  maxHeightDots = 1152
): Promise<MonoBitmap> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = widthDots / bitmap.width;
    const height = Math.max(1, Math.min(maxHeightDots, Math.round(bitmap.height * scale)));
    const canvas = document.createElement("canvas");
    canvas.width = widthDots;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak didukung");
    // Latar putih: PNG transparan (frame) tidak boleh jadi hitam penuh.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthDots, height);
    // Cover-fit: raster printer tidak boleh memuat gambar gepeng.
    const drawScale = Math.max(widthDots / bitmap.width, height / bitmap.height);
    const drawW = bitmap.width * drawScale;
    const drawH = bitmap.height * drawScale;
    ctx.drawImage(bitmap, (widthDots - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    const pixels = ctx.getImageData(0, 0, widthDots, height);
    const gray = rgbaToGray(pixels.data, widthDots, height);
    return floydSteinberg(gray, widthDots, height);
  } finally {
    bitmap.close();
  }
}

/** Gambar pola uji (teks + garis + kotak) untuk panel test printer. */
export async function rasterizeTestPattern(
  widthDots: number,
  lines: readonly string[]
): Promise<MonoBitmap> {
  const height = 320;
  const canvas = document.createElement("canvas");
  canvas.width = widthDots;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthDots, height);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, widthDots - 12, height - 12);
  ctx.fillStyle = "#000000";
  ctx.font = "bold 34px monospace";
  ctx.textBaseline = "top";
  lines.slice(0, 5).forEach((line, index) => {
    ctx.fillText(line, 24, 24 + index * 44);
  });
  // Bar hitam di bawah: bukti kontras dan tepi kertas.
  ctx.fillRect(24, height - 40, widthDots - 48, 16);
  const pixels = ctx.getImageData(0, 0, widthDots, height);
  return floydSteinberg(rgbaToGray(pixels.data, widthDots, height), widthDots, height);
}
