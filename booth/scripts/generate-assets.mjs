/**
 * Generator aset ikon aplikasi booth (placeholder brand, deterministik).
 *
 * Menghasilkan PNG + ICO tanpa dependensi eksternal supaya build MSIX di
 * Windows tidak butuh alat desain. Ganti berkas hasil dengan aset brand asli
 * sebelum rilis publik; skrip ini hanya menjamin build selalu punya ikon valid.
 *
 * Jalankan: node booth/scripts/generate-assets.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "..", "src", "SnapyOS.Booth.Shell", "Assets");

const BG = [0x0a, 0x0a, 0x0a];
const ACCENT = [0xe6, 0x19, 0x19];
const INK = [0xea, 0xea, 0xea];

// --- PNG (RGBA, tanpa filter) -----------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(width, height, pixel) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = 255;
      offset += 4;
    }
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO (membungkus PNG 256×256) -------------------------------------------

function ico(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256
  entry[1] = 0; // height 256
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(pngBuffer.length, 8); // bytes in resource
  entry.writeUInt32LE(22, 12); // offset
  return Buffer.concat([header, entry, pngBuffer]);
}

// --- Desain placeholder ------------------------------------------------------

/** Latar gelap, bingkai hazard red, blok tengah. Skala ikut ukuran. */
function logo(size) {
  const frame = Math.max(1, Math.round(size * 0.08));
  const block = Math.round(size * 0.34);
  const start = Math.round((size - block) / 2);
  const end = start + block;
  const notch = Math.round(size * 0.5);
  return (x, y) => {
    const onFrame = x < frame || y < frame || x >= size - frame || y >= size - frame;
    if (onFrame) {
      return ACCENT;
    }
    // Blok tengah dengan garis diagonal putih sebagai penanda struktur.
    if (x >= start && x < end && y >= start && y < end) {
      const diagonal = Math.abs(x - y) <= Math.max(1, Math.round(size * 0.03));
      if (diagonal && x > notch - block / 2 && x < notch + block / 2) {
        return INK;
      }
      return ACCENT;
    }
    return BG;
  };
}

mkdirSync(ASSETS, { recursive: true });

const targets = [
  ["StoreLogo.png", 50],
  ["Square150x150Logo.png", 150],
  ["Square44x44Logo.png", 44],
];

for (const [name, size] of targets) {
  writeFileSync(join(ASSETS, name), png(size, size, logo(size)));
}

writeFileSync(join(ASSETS, "app.ico"), ico(png(256, 256, logo(256))));

process.stdout.write(`assets written to ${ASSETS}\n`);
