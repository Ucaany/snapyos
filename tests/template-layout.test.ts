import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS_MAX,
  MAX_SLOTS,
  canvasBackground,
  clampSlot,
  coverFit,
  effectiveSlots,
  emptyLayout,
  layoutSchema,
  slotCount,
  slotPlacement,
  slotsByZ,
  type LayoutSlot,
  type TemplateLayout,
} from "../src/lib/template-layout.ts";

const canvas = { width: 1200, height: 1800 };

function slot(overrides: Partial<LayoutSlot> = {}): LayoutSlot {
  return {
    id: "slot_1",
    shape: "rect",
    x: 100,
    y: 200,
    width: 1000,
    height: 700,
    rotation: 0,
    radius: 24,
    fit: "cover",
    z: 0,
    ...overrides,
  };
}

function layout(slots: LayoutSlot[]): TemplateLayout {
  return { version: 1, canvas: { width: 1200, height: 1800, preset: "4x6-portrait" }, slots };
}

// --- validasi layout (docs/15 §15.2, trust boundary) ---

test("layoutSchema: layout valid lolos", () => {
  assert.equal(layoutSchema.safeParse(layout([slot()])).success, true);
});

test("layoutSchema: layout valid (contoh docs/15 §15.2) lolos", () => {
  const parsed = layoutSchema.safeParse({
    version: 1,
    canvas: { width: 1200, height: 1800, preset: "4x6-portrait" },
    slots: [
      {
        id: "slot_1",
        shape: "rect",
        x: 100,
        y: 200,
        width: 1000,
        height: 700,
        rotation: 0,
        radius: 24,
        fit: "cover",
        z: 0,
      },
    ],
  });
  assert.equal(parsed.success, true);
});

test("layoutSchema: slot keluar batas canvas ditolak", () => {
  assert.equal(layoutSchema.safeParse(layout([slot({ x: 300 })])).success, false); // 300+1000 > 1200
  assert.equal(layoutSchema.safeParse(layout([slot({ y: 1200 })])).success, false); // 1200+700 > 1800
});

test("layoutSchema: x/y negatif ditolak", () => {
  assert.equal(layoutSchema.safeParse(layout([slot({ x: -1 })])).success, false);
  assert.equal(layoutSchema.safeParse(layout([slot({ y: -1 })])).success, false);
});

test("layoutSchema: width/height <= 0 ditolak", () => {
  assert.equal(layoutSchema.safeParse(layout([slot({ width: 0 })])).success, false);
  assert.equal(layoutSchema.safeParse(layout([slot({ height: -5 })])).success, false);
});

test("layoutSchema: rotation di luar -180..180 ditolak", () => {
  assert.equal(layoutSchema.safeParse(layout([slot({ rotation: 181 })])).success, false);
  assert.equal(layoutSchema.safeParse(layout([slot({ rotation: -181 })])).success, false);
  assert.equal(layoutSchema.safeParse(layout([slot({ rotation: -180 })])).success, true);
  assert.equal(layoutSchema.safeParse(layout([slot({ rotation: 180 })])).success, true);
});

test("layoutSchema: shape & fit enum invalid ditolak", () => {
  assert.equal(
    layoutSchema.safeParse(layout([slot({ shape: "hexagon" as LayoutSlot["shape"] })])).success,
    false
  );
  assert.equal(
    layoutSchema.safeParse(layout([slot({ fit: "stretch" as LayoutSlot["fit"] })])).success,
    false
  );
});

test("layoutSchema: radius negatif ditolak", () => {
  assert.equal(layoutSchema.safeParse(layout([slot({ radius: -1 })])).success, false);
});

test(`layoutSchema: lebih dari ${MAX_SLOTS} slot ditolak`, () => {
  const slots = Array.from({ length: MAX_SLOTS + 1 }, (_, i) =>
    slot({ id: `s${i}`, x: 0, y: 0, width: 10, height: 10, z: i })
  );
  assert.equal(layoutSchema.safeParse(layout(slots)).success, false);
  const ok = Array.from({ length: MAX_SLOTS }, (_, i) =>
    slot({ id: `s${i}`, x: 0, y: 0, width: 10, height: 10, z: i })
  );
  assert.equal(layoutSchema.safeParse(layout(ok)).success, true);
});

test("layoutSchema: canvas melebihi max ditolak", () => {
  const l = layout([]);
  l.canvas = { width: CANVAS_MAX + 1, height: 1800, preset: "custom" };
  assert.equal(layoutSchema.safeParse(l).success, false);
});

test("layoutSchema: version selain 1 ditolak", () => {
  const l: TemplateLayout = layout([]);
  (l as { version: number }).version = 2;
  assert.equal(layoutSchema.safeParse(l).success, false);
});

// --- slotCount (legacy backward compatible, docs/15 §15.9 AC 5) ---

test("slotCount: layout kosong/null/legacy = 0", () => {
  assert.equal(slotCount(null), 0);
  assert.equal(slotCount(undefined), 0);
  assert.equal(slotCount({}), 0);
  assert.equal(
    slotCount({ version: 1, canvas: { width: 1, height: 1, preset: "x" }, slots: [] }),
    0
  );
});

test("slotCount: layout valid = jumlah slot", () => {
  const l = layout([slot(), slot({ id: "s2", z: 1 })]);
  assert.equal(slotCount(l), 2);
});

test("slotCount: layout invalid = 0", () => {
  assert.equal(slotCount(layout([slot({ x: 5000 })])), 0);
});

// --- cover-fit math (docs/15 §15.9 AC 2 — rasio tidak terdistorsi) ---

test("coverFit: cover — foto landscape ke slot portrait, skala = max", () => {
  // slot 1000x700, foto 4000x3000 → scale = max(1000/4000, 700/3000) = 0.25
  const r = coverFit(1000, 700, 4000, 3000, "cover");
  assert.equal(r.drawW, 1000);
  assert.equal(r.drawH, 750);
  assert.equal(r.dx, 0);
  assert.equal(r.dy, -25);
});

test("coverFit: cover — foto portrait ke slot landscape", () => {
  // slot 700x1000, foto 3000x4000 → scale = max(700/3000, 1000/4000) = 0.25
  const r = coverFit(700, 1000, 3000, 4000, "cover");
  assert.equal(r.drawW, 750);
  assert.equal(r.drawH, 1000);
  assert.equal(r.dx, -25);
  assert.equal(r.dy, 0);
});

test("coverFit: contain — foto di-center utuh", () => {
  // slot 1000x700, foto 4000x3000 → scale = min(0.25, 0.2333…) = 700/3000
  const r = coverFit(1000, 700, 4000, 3000, "contain");
  assert.equal(r.drawW, 4000 * (700 / 3000));
  assert.equal(r.drawH, 700);
  assert.equal(r.dx, (1000 - 4000 * (700 / 3000)) / 2);
  assert.equal(r.dy, 0);
});

test("coverFit: rasio foto terjaga (drawW/imgW == drawH/imgH)", () => {
  const r = coverFit(333, 777, 1280, 720, "cover");
  assert.ok(Math.abs(r.drawW / 1280 - r.drawH / 720) < 1e-12);
});

// --- slotPlacement: clamp zoom/pan (docs/15 §5.9 — zoom minimal cover-fit) ---

test("slotPlacement: zoom < 1 di-clamp ke 1 (cover-fit)", () => {
  const p = slotPlacement(slot({ width: 1000, height: 700 }), 4000, 3000, { zoom: 0.5 });
  assert.equal(p.zoom, 1);
  assert.equal(p.drawW, 1000);
  assert.equal(p.drawH, 750);
});

test("slotPlacement: pan dibatasi agar foto tetap menutup slot", () => {
  const s = slot({ width: 1000, height: 700 });
  // drawH=750 → slack Y = 25; panY 999 → clamp 25
  const p = slotPlacement(s, 4000, 3000, { panY: 999, panX: 999 });
  assert.equal(p.panY, 25);
  // drawW=1000 == slot → slack X = 0 → panX clamp 0
  assert.equal(p.panX, 0);
  // posisi tetap menutup slot
  assert.ok(p.x <= 100 && p.x + p.drawW >= 1100);
  assert.ok(p.y <= 200 && p.y + p.drawH >= 900);
});

test("slotPlacement: pan negatif di-clamp simetris", () => {
  const p = slotPlacement(slot({ width: 1000, height: 700 }), 4000, 3000, { panY: -999 });
  assert.equal(p.panY, -25);
});

test("slotPlacement: zoom memperluas slack pan", () => {
  // zoom 2 → drawW 2000 → slack X = 500
  const p = slotPlacement(slot({ width: 1000, height: 700 }), 4000, 3000, { zoom: 2, panX: 9999 });
  assert.equal(p.panX, 500);
});

// --- slotsByZ: urutan render deterministik (docs/15 §15.4) ---

test("slotsByZ: urut z naik, deterministik", () => {
  const s0 = slot({ id: "a", z: 5 });
  const s1 = slot({ id: "b", z: 1 });
  const s2 = slot({ id: "c", z: 3 });
  assert.deepEqual(
    slotsByZ(layout([s0, s1, s2])).map((s) => s.id),
    ["b", "c", "a"]
  );
  assert.deepEqual(
    slotsByZ(layout([s0, s1, s2])).map((s) => s.id),
    ["b", "c", "a"]
  );
});

// --- clampSlot (aturan builder, docs/15 §15.3) ---

test("clampSlot: slot keluar canvas di-clamp ke dalam", () => {
  const c = clampSlot(slot({ x: 500, y: 1500, width: 1000, height: 700 }), canvas);
  assert.equal(c.x, 200); // 1200 - 1000
  assert.equal(c.y, 1100); // 1800 - 700
});

test("clampSlot: x/y negatif di-clamp ke 0", () => {
  const c = clampSlot(slot({ x: -50, y: -10 }), canvas);
  assert.equal(c.x, 0);
  assert.equal(c.y, 0);
});

test("clampSlot: ukuran minimal 1 & tidak melebihi canvas", () => {
  const c = clampSlot(slot({ width: 9999, height: 0 }), canvas);
  assert.equal(c.width, 1200);
  assert.equal(c.height, 1);
});

// --- emptyLayout ---

test("emptyLayout: preset menghasilkan canvas sesuai docs/15 §15.2", () => {
  // Bandingkan field kontrak (dimensi + preset), bukan seluruh objek: canvas
  // boleh membawa field tambahan (mis. warna dasar) tanpa mematahkan kontrak.
  const portrait = emptyLayout("4x6-portrait").canvas;
  assert.equal(portrait.width, 1200);
  assert.equal(portrait.height, 1800);
  assert.equal(portrait.preset, "4x6-portrait");

  const strip = emptyLayout("2x6-strip").canvas;
  assert.equal(strip.width, 600);
  assert.equal(strip.height, 1800);
  assert.equal(strip.preset, "2x6-strip");

  const square = emptyLayout("square").canvas;
  assert.equal(square.width, 1500);
  assert.equal(square.height, 1500);
  assert.equal(square.preset, "square");

  assert.equal(emptyLayout("custom").slots.length, 0);
  assert.equal(layoutSchema.safeParse(emptyLayout("square")).success, true);
});
test("effectiveSlots: layout tanpa slot = satu slot full-canvas di belakang frame", () => {
  const layout = emptyLayout("4x6-portrait");
  const eff = effectiveSlots(layout);
  assert.equal(eff.length, 1);
  const only = eff[0]!;
  assert.equal(only.x, 0);
  assert.equal(only.y, 0);
  assert.equal(only.width, layout.canvas.width);
  assert.equal(only.height, layout.canvas.height);
  assert.equal(only.fit, "cover");
  assert.equal(only.z, 0);
});

test("effectiveSlots: layout ber-slot dipakai apa adanya, urut z", () => {
  const layout: TemplateLayout = {
    version: 1,
    canvas: { ...canvas, preset: "4x6-portrait" },
    slots: [slot({ id: "b", z: 5 }), slot({ id: "a", z: 1 })],
  };
  const eff = effectiveSlots(layout);
  assert.deepEqual(
    eff.map((s) => s.id),
    ["a", "b"]
  );
  assert.deepEqual(eff, slotsByZ(layout));
});

// --- warna dasar kanvas (chroma key) ---

test("canvasBackground: template lama tanpa background memakai putih", () => {
  assert.equal(
    canvasBackground({ version: 1, canvas: { ...canvas, preset: "custom" }, slots: [] }),
    "#ffffff"
  );
});

test("canvasBackground: nilai tersimpan dipakai apa adanya", () => {
  const layout = emptyLayout("square");
  layout.canvas.background = "#0a0a0a";
  assert.equal(canvasBackground(layout), "#0a0a0a");
});

test("layoutSchema: background harus hex 6 digit", () => {
  const ok = layoutSchema.safeParse({
    version: 1,
    canvas: { ...canvas, preset: "custom", background: "#00b140" },
    slots: [],
  });
  assert.equal(ok.success, true);

  for (const bad of ["green", "#0f0", "#00b1400", "rgb(0,0,0)"]) {
    const parsed = layoutSchema.safeParse({
      version: 1,
      canvas: { ...canvas, preset: "custom", background: bad },
      slots: [],
    });
    assert.equal(parsed.success, false, `background "${bad}" harus ditolak`);
  }
});

test("emptyLayout membawa warna dasar default agar chroma tidak hitam", () => {
  assert.equal(emptyLayout("4x6-portrait").canvas.background, "#ffffff");
  assert.equal(canvasBackground(emptyLayout("4x6-portrait")), "#ffffff");
});
