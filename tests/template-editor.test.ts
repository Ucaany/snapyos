/**
 * Geometri editor slot: 8 handle hit-test, resize per handle, drag grup, snap.
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HANDLES,
  handlePoints,
  hitHandle,
  moveSlots,
  resizeSlot,
  unionBox,
} from "../src/lib/template-editor.ts";
import { snapRect } from "../src/lib/template-snap.ts";
import type { LayoutSlot } from "../src/lib/template-layout.ts";

const canvas = { width: 1000, height: 1000 };

function slot(over: Partial<LayoutSlot> = {}): LayoutSlot {
  return {
    id: "s1",
    shape: "rect",
    x: 100,
    y: 100,
    width: 400,
    height: 300,
    rotation: 0,
    radius: 0,
    fit: "cover",
    z: 0,
    ...over,
  };
}

test("handlePoints: 8 handle pada bbox slot", () => {
  const points = handlePoints(slot());
  assert.equal(points.length, 8);
  assert.deepEqual(
    points.map((p) => p.id),
    [...HANDLES]
  );
  const byId = new Map(points.map((p) => [p.id, p]));
  assert.deepEqual([byId.get("nw")!.x, byId.get("nw")!.y], [100, 100]);
  assert.deepEqual([byId.get("se")!.x, byId.get("se")!.y], [500, 400]);
  assert.deepEqual([byId.get("n")!.x, byId.get("n")!.y], [300, 100]);
  assert.deepEqual([byId.get("w")!.x, byId.get("w")!.y], [100, 250]);
});

test("hitHandle: SEMUA 8 handle kena (bukan hanya sudut tenggara)", () => {
  const s = slot();
  for (const point of handlePoints(s)) {
    assert.equal(hitHandle(s, point.x, point.y, 12), point.id, `handle ${point.id} harus hit-test`);
  }
});

test("hitHandle: di luar toleransi -> null", () => {
  assert.equal(hitHandle(slot(), 300, 250, 12), null);
});

test("resizeSlot: handle e mengubah width saja", () => {
  const s = slot();
  const next = resizeSlot(s, "e", 50, 40, canvas, {
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
  });
  assert.equal(next.width, 450);
  assert.equal(next.height, 300);
  assert.equal(next.x, 100);
  assert.equal(next.y, 100);
});

test("resizeSlot: handle nw menggeser x/y dan mengecilkan ukuran", () => {
  const s = slot();
  const next = resizeSlot(s, "nw", 50, 30, canvas, {
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
  });
  assert.equal(next.x, 150);
  assert.equal(next.y, 130);
  assert.equal(next.width, 350);
  assert.equal(next.height, 270);
});

test("resizeSlot: handle n hanya mengubah height dari atas", () => {
  const s = slot();
  const next = resizeSlot(s, "n", 0, -50, canvas, {
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
  });
  assert.equal(next.y, 50);
  assert.equal(next.height, 350);
  assert.equal(next.width, 400);
});

test("resizeSlot: circle tetap persegi", () => {
  const s = slot({ shape: "circle", width: 300, height: 300 });
  const next = resizeSlot(s, "se", 100, 10, canvas, {
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
  });
  assert.equal(next.width, next.height);
});

test("resizeSlot: clamp ke dalam kanvas", () => {
  const s = slot({ x: 900, y: 900, width: 100, height: 100 });
  const next = resizeSlot(s, "se", 500, 500, canvas, {
    x: 900,
    y: 900,
    width: 100,
    height: 100,
  });
  assert.equal(next.x + next.width, 1000);
  assert.equal(next.y + next.height, 1000);
});

test("moveSlots: hanya id terpilih bergeser, clamp per slot", () => {
  const a = slot({ id: "a", x: 0, y: 0 });
  const b = slot({ id: "b", x: 500, y: 500 });
  const moved = moveSlots(
    [a, b],
    new Set(["a", "b"]),
    -100,
    20,
    canvas,
    new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 500, y: 500 }],
    ])
  );
  assert.equal(moved[0]!.x, 0); // clamp kiri
  assert.equal(moved[0]!.y, 20);
  assert.equal(moved[1]!.x, 400);
  assert.equal(moved[1]!.y, 520);
});

test("unionBox: bbox gabungan", () => {
  const box = unionBox([
    slot({ x: 0, y: 0, width: 100, height: 100 }),
    slot({ x: 200, y: 50, width: 100, height: 100 }),
  ]);
  assert.deepEqual(box, { left: 0, top: 0, right: 300, bottom: 150 });
  assert.equal(unionBox([]), null);
});

test("snapRect: menempel ke tepi kanvas kiri", () => {
  const result = snapRect({ x: 5, y: 500, width: 100, height: 100 }, [], canvas);
  assert.equal(result.x, 0);
  assert.ok(result.guides.some((g) => g.axis === "x" && g.position === 0));
});

test("snapRect: menempel ke tengah kanvas", () => {
  // rect 200 wide: center 500 → x = 400
  const result = snapRect({ x: 405, y: 50, width: 200, height: 100 }, [], canvas);
  assert.equal(result.x, 400);
  assert.ok(result.guides.some((g) => g.axis === "x" && g.position === 500));
});

test("snapRect: menempel ke tepi slot lain", () => {
  const other = { x: 650, y: 0, width: 200, height: 200 };
  const result = snapRect({ x: 545, y: 500, width: 100, height: 100 }, [other], canvas);
  // tepi kanan rect 645 menempel ke tepi kiri slot lain 650
  assert.equal(result.x, 550);
  assert.ok(result.guides.some((g) => g.axis === "x" && g.position === 650));
});

test("snapRect: di luar ambang tidak menggeser", () => {
  const result = snapRect({ x: 50, y: 50, width: 100, height: 100 }, [], canvas, 2);
  assert.equal(result.x, 50);
  assert.equal(result.y, 50);
  assert.deepEqual(result.guides, []);
});
