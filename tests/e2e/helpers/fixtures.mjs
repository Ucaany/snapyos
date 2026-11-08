/**
 * Fixture kamera palsu untuk suite E2E chroma. Video Y4M I420 dibuat saat
 * runtime — tidak ada biner besar di repo dan tidak ada dependency baru.
 *
 * Chromium membaca file ini lewat `--use-file-for-fake-video-capture`.
 */

import { writeFileSync } from "node:fs";

/** Nilai YUV BT.601 untuk warna solid yang dipakai gate chroma. */
export const YUV = {
  // RGB(0, 255, 0) — harus lolos gate hijau.
  green: { y: 150, u: 44, v: 21 },
  // RGB(0, 0, 255) — non-hijau; gate harus menolak tanpa mengubah piksel.
  blue: { y: 29, u: 255, v: 107 },
  // Abu netral — kasus backdrop bukan layar hijau.
  gray: { y: 128, u: 128, v: 128 },
};

/**
 * Tulis satu file Y4M berisi satu frame solid. `path` dikembalikan agar
 * pemanggil bisa langsung memberikannya ke env `E2E_FAKE_VIDEO`.
 */
export function writeSolidY4m(path, color, { width = 1280, height = 720 } = {}) {
  const { y, u, v } = color;
  const chromaWidth = Math.ceil(width / 2);
  const chromaHeight = Math.ceil(height / 2);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F25:1 Ip A1:1 C420jpeg\n`, "ascii");
  const luma = Buffer.alloc(width * height, y);
  const cb = Buffer.alloc(chromaWidth * chromaHeight, u);
  const cr = Buffer.alloc(chromaWidth * chromaHeight, v);
  writeFileSync(path, Buffer.concat([header, Buffer.from("FRAME\n", "ascii"), luma, cb, cr]));
  return path;
}
