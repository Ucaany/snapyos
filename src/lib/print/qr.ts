/**
 * QR untuk printer thermal, dirender sebagai raster 1bpp, bukan perintah
 * `GS ( k`. Alasan: perintah QR native berbeda antar firmware (dan sebagian
 * printer murah tidak punya), sedangkan raster selalu tercetak sama.
 *
 * Matriks modul diambil dari paket `qrcode` yang sudah dipakai kiosk untuk QR
 * pembayaran, jadi tidak ada dependency baru.
 */

import QRCode from "qrcode";

import { packMono, type MonoBitmap } from "./dither.ts";

/**
 * @param text isi QR (URL result / kode sesi)
 * @param moduleSize piksel per modul; 4 aman untuk 576 dot (80mm)
 * @param quietZone modul kosong di tiap sisi (spesifikasi QR: minimal 4)
 */
export function qrBitmap(text: string, moduleSize = 4, quietZone = 4): MonoBitmap {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const modules = qr.modules;
  const size = modules.size;
  const quiet = Math.max(0, Math.floor(quietZone));
  const dotsPerModule = Math.max(1, Math.floor(moduleSize));
  const width = (size + quiet * 2) * dotsPerModule;
  const mono = new Uint8Array(width * width);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules.get(x, y)) continue;
      const startX = (x + quiet) * dotsPerModule;
      const startY = (y + quiet) * dotsPerModule;
      for (let dy = 0; dy < dotsPerModule; dy++) {
        const row = (startY + dy) * width;
        for (let dx = 0; dx < dotsPerModule; dx++) {
          mono[row + startX + dx] = 1;
        }
      }
    }
  }
  return packMono(mono, width, width);
}
