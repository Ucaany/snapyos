"use client";

/**
 * Tempel QR result ke atas foto cetak.
 *
 * QR dirender dari `qrBitmap` (raster 1bpp) lalu digambar ke kanvas foto, jadi
 * satu lembar tetap SATU gambar — jalur CUPS dan ESC/POS sama-sama menerima
 * satu blob per lembar, tanpa mengubah geometri strip.
 *
 * Kegagalan (canvas/encode/dimensi aneh) mengembalikan blob asli: QR tidak
 * boleh menggagalkan cetak yang sudah dibayar customer.
 */

import { qrBitmap } from "./qr";

export async function stampQr(blob: Blob, url: string): Promise<Blob> {
  const text = url.trim();
  if (!text) return blob;
  let source: ImageBitmap | null = null;
  try {
    source = await createImageBitmap(blob);
    const width = source.width;
    const height = source.height;
    if (width < 32 || height < 32) return blob;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    // Kertas selalu putih: PNG transparan (frame) tidak boleh jadi hitam.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    // ~18% lebar foto: terbaca dari jarak 30 cm tanpa menutupi subjek.
    const qr = qrBitmap(text, 4, 4);
    const target = Math.max(96, Math.round(width * 0.18));
    const cell = target / qr.width;
    const pad = Math.max(4, Math.round(width * 0.015));
    const x0 = width - target - pad;
    const y0 = height - target - pad;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0 - pad, y0 - pad, target + pad * 2, target + pad * 2);
    ctx.fillStyle = "#000000";
    const rowBytes = Math.ceil(qr.width / 8);
    for (let y = 0; y < qr.height; y++) {
      for (let x = 0; x < qr.width; x++) {
        const byte = qr.data[y * rowBytes + (x >> 3)] ?? 0;
        if (((byte >> (7 - (x & 7))) & 1) === 0) continue;
        ctx.fillRect(x0 + x * cell, y0 + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }

    const stamped = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92);
    });
    return stamped ?? blob;
  } catch {
    return blob;
  } finally {
    source?.close();
  }
}
