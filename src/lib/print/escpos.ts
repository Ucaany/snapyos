/**
 * Encoder ESC/POS, PURE (tanpa DOM), byte deterministik agar bisa diuji
 * dengan golden vector.
 *
 * Command yang dipakai sengaja yang paling universal di printer thermal
 * 58/80mm (Epson-compatible): ESC @, ESC a, ESC E, GS !, GS v 0, ESC d, GS V.
 * QR dirender sebagai raster (bukan GS ( k) supaya tidak bergantung firmware.
 */

import type { MonoBitmap } from "./dither.ts";

/** ESC @, reset printer ke default. Selalu byte pertama satu job. */
export function escInit(): Uint8Array {
  return new Uint8Array([0x1b, 0x40]);
}

export type Align = "left" | "center" | "right";

/** ESC a n, perataan teks. */
export function escAlign(align: Align): Uint8Array {
  const n = align === "center" ? 1 : align === "right" ? 2 : 0;
  return new Uint8Array([0x1b, 0x61, n]);
}

/** ESC E n, bold on/off. */
export function escEmphasis(on: boolean): Uint8Array {
  return new Uint8Array([0x1b, 0x45, on ? 1 : 0]);
}

/** GS ! n, ukuran karakter (width-1 di high nibble, height-1 di low). */
export function escTextSize(width: 1 | 2 | 3, height: 1 | 2 | 3): Uint8Array {
  return new Uint8Array([0x1d, 0x21, ((width - 1) << 4) | (height - 1)]);
}

/** ESC d n, feed n baris. */
export function feed(lines: number): Uint8Array {
  return new Uint8Array([0x1b, 0x64, Math.max(0, Math.min(255, Math.floor(lines)))]);
}

/** GS V m, potong kertas (0 = penuh, 1 = parsial). */
export function cut(partial = true): Uint8Array {
  return new Uint8Array([0x1d, 0x56, partial ? 1 : 0]);
}

/** GS v 0, raster bitmap. xL/xH = lebar byte, yL/yH = tinggi baris. */
export function gsRasterHeader(widthBytes: number, height: number): Uint8Array {
  return new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);
}

/**
 * Raster bitmap, dipecah per `maxRows` baris agar satu perintah tidak terlalu
 * besar (printer murah memotong buffer di ~64KB dan hasilnya terpotong diam-diam).
 */
export function gsRaster(bitmap: MonoBitmap, maxRows = 128): Uint8Array {
  const rowBytes = Math.ceil(bitmap.width / 8);
  if (rowBytes === 0 || bitmap.height === 0) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  for (let y = 0; y < bitmap.height; y += maxRows) {
    const rows = Math.min(maxRows, bitmap.height - y);
    chunks.push(gsRasterHeader(rowBytes, rows));
    chunks.push(bitmap.data.slice(y * rowBytes, (y + rows) * rowBytes));
  }
  return concat(chunks);
}

/** Teks ESC/POS: ASCII saja (printer thermal tidak punya font Unicode). */
export function sanitizeText(text: string): string {
  const map: Record<string, string> = {
    "×": "x",
    "·": "-",
    "–": "-",
    "—": "-",
    "’": "'",
    "“": '"',
    "”": '"',
    "•": "*",
  };
  return text
    .replace(/[×·–—’“”•]/g, (ch) => map[ch] ?? "")
    .replace(/[^\x20-\x7e\n]/g, "");
}

export type EscPosBlock =
  | { kind: "raster"; bitmap: MonoBitmap; maxRows?: number }
  | { kind: "text"; text: string; align?: Align; emphasis?: boolean; size?: 1 | 2 | 3 }
  | { kind: "feed"; lines: number }
  | { kind: "cut"; partial?: boolean };

function textBlock(block: Extract<EscPosBlock, { kind: "text" }>): Uint8Array {
  const parts: Uint8Array[] = [];
  if (block.align) parts.push(escAlign(block.align));
  if (block.emphasis) parts.push(escEmphasis(true));
  if (block.size) parts.push(escTextSize(block.size, block.size));
  parts.push(encodeAscii(sanitizeText(block.text) + "\n"));
  if (block.size) parts.push(escTextSize(1, 1));
  if (block.emphasis) parts.push(escEmphasis(false));
  return concat(parts);
}

function encodeAscii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Rangkai satu job lengkap. `init` default true (reset sebelum mencetak). */
export function encodeEscPos(blocks: readonly EscPosBlock[], options: { init?: boolean } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  if (options.init !== false) parts.push(escInit());
  for (const block of blocks) {
    switch (block.kind) {
      case "raster":
        parts.push(gsRaster(block.bitmap, block.maxRows ?? 128));
        break;
      case "text":
        parts.push(textBlock(block));
        break;
      case "feed":
        parts.push(feed(block.lines));
        break;
      case "cut":
        parts.push(feed(3));
        parts.push(cut(block.partial ?? true));
        break;
    }
  }
  return concat(parts);
}
