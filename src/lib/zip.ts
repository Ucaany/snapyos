/**
 * ZIP writer store-only (tanpa dependensi) — dipakai unduh massal hasil.
 *
 * Format sengaja tanpa kompresi: foto JPEG sudah terkompresi, dan store-only
 * memungkinkan ukuran akurat tanpa buffer kompresi tambahan.
 */

export type ZipFile = { name: string; data: Uint8Array };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Nama aman di dalam ZIP (tanpa path traversal / karakter kontrol). */
export function safeZipName(name: string, fallback: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return base.length > 0 ? base.slice(0, 120) : fallback;
}

type Entry = {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
};

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/** Bangun ZIP store-only. Nama file dideduplikasi agar tidak saling menimpa. */
export function createZip(files: ZipFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const entries: Entry[] = [];
  const used = new Map<string, number>();
  let localSize = 0;

  const prepared = files.map((file, index) => {
    let name = safeZipName(file.name, `foto-${index + 1}.jpg`);
    const count = used.get(name) ?? 0;
    used.set(name, count + 1);
    if (count > 0) {
      const dot = name.lastIndexOf(".");
      name = dot > 0 ? `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}` : `${name}-${count + 1}`;
    }
    const nameBytes = encoder.encode(name);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const entry: Entry = { nameBytes, data, crc: crc32(data), offset: localSize };
    localSize += 30 + nameBytes.length + data.length;
    entries.push(entry);
    return entry;
  });

  let centralSize = 0;
  for (const entry of prepared) centralSize += 46 + entry.nameBytes.length;

  const buffer = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(buffer.buffer);
  let cursor = 0;

  for (const entry of prepared) {
    writeU32(view, cursor, 0x04034b50);
    writeU16(view, cursor + 4, 20);
    writeU16(view, cursor + 6, 0x0800);
    writeU16(view, cursor + 8, 0);
    writeU16(view, cursor + 10, 0);
    writeU16(view, cursor + 12, 0);
    writeU32(view, cursor + 14, entry.crc);
    writeU32(view, cursor + 18, entry.data.length);
    writeU32(view, cursor + 22, entry.data.length);
    writeU16(view, cursor + 26, entry.nameBytes.length);
    writeU16(view, cursor + 28, 0);
    buffer.set(entry.nameBytes, cursor + 30);
    buffer.set(entry.data, cursor + 30 + entry.nameBytes.length);
    cursor += 30 + entry.nameBytes.length + entry.data.length;
  }

  const centralStart = cursor;
  for (const entry of prepared) {
    writeU32(view, cursor, 0x02014b50);
    writeU16(view, cursor + 4, 20);
    writeU16(view, cursor + 6, 20);
    writeU16(view, cursor + 8, 0x0800);
    writeU16(view, cursor + 10, 0);
    writeU16(view, cursor + 12, 0);
    writeU16(view, cursor + 14, 0);
    writeU32(view, cursor + 16, entry.crc);
    writeU32(view, cursor + 20, entry.data.length);
    writeU32(view, cursor + 24, entry.data.length);
    writeU16(view, cursor + 28, entry.nameBytes.length);
    writeU16(view, cursor + 30, 0);
    writeU16(view, cursor + 32, 0);
    writeU16(view, cursor + 34, 0);
    writeU16(view, cursor + 36, 0);
    writeU32(view, cursor + 38, 0);
    writeU32(view, cursor + 42, entry.offset);
    buffer.set(entry.nameBytes, cursor + 46);
    cursor += 46 + entry.nameBytes.length;
  }

  writeU32(view, cursor, 0x06054b50);
  writeU16(view, cursor + 4, 0);
  writeU16(view, cursor + 6, 0);
  writeU16(view, cursor + 8, prepared.length);
  writeU16(view, cursor + 10, prepared.length);
  writeU32(view, cursor + 12, cursor - centralStart);
  writeU32(view, cursor + 16, centralStart);
  writeU16(view, cursor + 20, 0);

  return buffer;
}

export const ZIP_MAX_FILES = 50;
export const ZIP_MAX_BYTES = 100 * 1024 * 1024;

/** Batas ukuran unduhan massal — dicek sebelum fetch agar tidak OOM. */
export function withinZipLimits(count: number, totalBytes: number): boolean {
  return count > 0 && count <= ZIP_MAX_FILES && totalBytes <= ZIP_MAX_BYTES;
}
