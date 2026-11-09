import test from "node:test";
import assert from "node:assert/strict";

import { crc32, createZip, safeZipName, withinZipLimits } from "../src/lib/zip.ts";

const encoder = new TextEncoder();

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

test("crc32 cocok dengan vektor standar", () => {
  assert.equal(crc32(encoder.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("createZip: store-only, signature lokal + central directory + EOCD", () => {
  const zip = createZip([
    { name: "a.jpg", data: encoder.encode("hello") },
    { name: "b.jpg", data: encoder.encode("world") },
  ]);
  assert.equal(readU32(zip, 0), 0x04034b50);
  const eocd = zip.length - 22;
  assert.equal(readU32(zip, eocd), 0x06054b50);
  // Jumlah entri di EOCD.
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint16(eocd + 8, true), 2);
});

test("createZip: nama duplikat dideduplikasi agar tidak saling menimpa", () => {
  const zip = createZip([
    { name: "snapyos.jpg", data: encoder.encode("one") },
    { name: "snapyos.jpg", data: encoder.encode("two") },
  ]);
  const text = new TextDecoder().decode(zip);
  assert.ok(text.includes("snapyos.jpg"));
  assert.ok(text.includes("snapyos-2.jpg"));
});

test("safeZipName menolak path traversal dan nama kosong", () => {
  assert.equal(safeZipName("../etc/passwd", "f.jpg"), ".._etc_passwd");
  assert.equal(safeZipName("   ", "f.jpg"), "f.jpg");
});

test("withinZipLimits: batas 50 berkas / 100 MB", () => {
  assert.equal(withinZipLimits(1, 1024), true);
  assert.equal(withinZipLimits(0, 1024), false);
  assert.equal(withinZipLimits(51, 1024), false);
  assert.equal(withinZipLimits(2, 100 * 1024 * 1024 + 1), false);
});
