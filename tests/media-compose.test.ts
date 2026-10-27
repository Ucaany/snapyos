/**
 * Compose server-side — sumber: src/server/media/compose.ts.
 *
 * Fokus: kontrak keluarannya (dimensi, format, latar, chroma, frame) dan
 * batasan yang diakui. Bukan uji estetika.
 */

import assert from "node:assert/strict";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

register(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "helpers", "resolve-loader.mjs")).href,
  import.meta.url
);

const { composeLayout } = await import("../src/server/media/compose.ts");
const { default: sharp } = await import("sharp");

const CANVAS = { width: 200, height: 150, preset: "custom", background: "#ffffff" };

function layoutWith(slots: unknown[]): unknown {
  return { version: 1, canvas: CANVAS, slots };
}

const fullSlot = (extra: Record<string, unknown> = {}) => ({
  id: "s1",
  shape: "rect",
  x: 0,
  y: 0,
  width: 200,
  height: 150,
  rotation: 0,
  z: 0,
  fit: "cover",
  ...extra,
});

async function solid(width: number, height: number, rgb: { r: number; g: number; b: number }) {
  return sharp({ create: { width, height, channels: 3, background: rgb } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

async function pixelAt(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return { r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]! };
}

function near(value: number, expected: number, tolerance = 16) {
  return Math.abs(value - expected) <= tolerance;
}

test("composeLayout: output JPEG dengan dimensi canvas", async () => {
  const result = await composeLayout({
    layout: layoutWith([fullSlot()]),
    photos: [{ buffer: await solid(400, 300, { r: 20, g: 40, b: 60 }) }],
  });

  assert.equal(result.buffer[0], 0xff);
  assert.equal(result.buffer[1], 0xd8);
  assert.equal(result.width, 200);
  assert.equal(result.height, 150);
  assert.deepEqual(result.limitations, []);
});

test("composeLayout: maxWidth menskalakan output", async () => {
  const result = await composeLayout({
    layout: layoutWith([fullSlot()]),
    photos: [{ buffer: await solid(400, 300, { r: 20, g: 40, b: 60 }) }],
    maxWidth: 100,
  });
  assert.equal(result.width, 100);
  assert.equal(result.height, 75);
});

test("composeLayout: chroma key hijau → piksel jadi warna dasar canvas", async () => {
  const result = await composeLayout({
    layout: layoutWith([fullSlot()]),
    photos: [{ buffer: await solid(200, 150, { r: 0, g: 177, b: 64 }) }],
    chromaKey: true,
  });
  const corner = await pixelAt(result.buffer, 2, 2);
  assert.ok(
    near(corner.r, 255) && near(corner.g, 255) && near(corner.b, 255),
    `latar hijau harus tembus ke dasar putih, dapat ${JSON.stringify(corner)}`
  );
});

test("composeLayout: tanpa chroma key piksel tetap hijau", async () => {
  const result = await composeLayout({
    layout: layoutWith([fullSlot()]),
    photos: [{ buffer: await solid(200, 150, { r: 0, g: 177, b: 64 }) }],
  });
  const corner = await pixelAt(result.buffer, 2, 2);
  assert.ok(near(corner.g, 177), `hijau harus dipertahankan, dapat ${JSON.stringify(corner)}`);
});

test("composeLayout: frame full-canvas menutup foto", async () => {
  const result = await composeLayout({
    layout: layoutWith([fullSlot()]),
    photos: [{ buffer: await solid(200, 150, { r: 20, g: 40, b: 60 }) }],
    frame: await sharp({
      create: { width: 200, height: 150, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer(),
  });
  const center = await pixelAt(result.buffer, 100, 75);
  assert.ok(near(center.r, 255) && near(center.g, 0), `frame harus di atas, dapat ${JSON.stringify(center)}`);
});

test("composeLayout: filter diterapkan per slot", async () => {
  const plain = await composeLayout({
    layout: layoutWith([fullSlot()]),
    photos: [{ buffer: await solid(60, 60, { r: 200, g: 100, b: 50 }) }],
  });
  const bw = await composeLayout({
    layout: layoutWith([fullSlot()]),
    photos: [{ buffer: await solid(60, 60, { r: 200, g: 100, b: 50 }), filter: "bw" }],
  });
  const a = await pixelAt(plain.buffer, 100, 75);
  const b = await pixelAt(bw.buffer, 100, 75);
  assert.ok(a.r !== b.r || a.g !== b.g || a.b !== b.b, "filter bw harus mengubah piksel");
  assert.ok(near(b.r, b.g, 8) && near(b.g, b.b, 8), `bw harus abu-abu, dapat ${JSON.stringify(b)}`);
});

test("composeLayout: slot kosong dilaporkan sebagai limitation, bukan crash", async () => {
  const result = await composeLayout({
    layout: layoutWith([fullSlot(), fullSlot({ id: "s2", x: 0, y: 0, z: 1 })]),
    photos: [null, null],
  });
  assert.ok(result.limitations.includes("empty-slot"));
});

test("composeLayout: slot.rotation dilaporkan sebagai batasan", async () => {
  const result = await composeLayout({
    layout: layoutWith([fullSlot({ rotation: 45 })]),
    photos: [{ buffer: await solid(200, 150, { r: 10, g: 10, b: 10 }) }],
  });
  assert.ok(result.limitations.includes("slot.rotation"));
});

test("composeLayout: overlay teks dilaporkan sebagai batasan font", async () => {
  const result = await composeLayout({
    layout: layoutWith([fullSlot()]),
    photos: [{ buffer: await solid(200, 150, { r: 10, g: 10, b: 10 }) }],
    overlays: [
      { id: "o1", kind: "text", content: "HALO", x: 0.5, y: 0.5, size: 0.1, color: "#ffffff", rotation: 0 },
    ],
  });
  assert.ok(result.limitations.includes("overlay-font"));
});

test("composeLayout: layout tidak valid ditolak", async () => {
  await assert.rejects(async () => {
    await composeLayout({
      layout: { version: 2, canvas: CANVAS, slots: [] },
      photos: [],
    });
  }, /Layout tidak valid/);
});

test("composeLayout: slot melebihi canvas ditolak oleh kontrak layout", async () => {
  const photo = await solid(10, 10, { r: 0, g: 0, b: 0 });
  await assert.rejects(async () => {
    await composeLayout({
      layout: layoutWith([fullSlot({ width: 999 })]),
      photos: [{ buffer: photo }],
    });
  }, /Layout tidak valid/);
});
