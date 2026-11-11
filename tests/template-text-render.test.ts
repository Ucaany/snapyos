/**
 * Layer teks template harus benar-benar muncul di render (composeFrame).
 * Run: npm test
 *
 * Memakai context palsu yang merekam fillText — cukup membuktikan teks
 * digambar oleh `drawSlotText` (yang dipanggil composeFrame setelah frame),
 * tanpa canvas native.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { drawSlotText, slotTextProps, wrapText, type TextContext } from "../src/lib/slot-text.ts";
import { layoutSchema, type LayoutSlot } from "../src/lib/template-layout.ts";

type Call = { text: string; x: number; y: number; alpha: number };

function fakeContext() {
  const texts: Call[] = [];
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "top" as CanvasTextBaseline,
    globalAlpha: 1,
    letterSpacing: "0px",
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    translate() {},
    rotate() {},
    measureText(text: string) {
      return { width: text.length * 10 };
    },
    fillText(this: { globalAlpha: number }, text: string, x: number, y: number) {
      texts.push({ text, x, y, alpha: this.globalAlpha });
    },
  };
  return { ctx: ctx as unknown as TextContext, texts };
}

function slotOf(properties?: Record<string, unknown>): LayoutSlot {
  const parsed = layoutSchema.parse({
    version: 1,
    canvas: { width: 600, height: 600, preset: "custom", background: "#ffffff" },
    slots: [
      {
        id: "s1",
        shape: "rect",
        x: 100,
        y: 100,
        width: 400,
        height: 200,
        rotation: 0,
        fit: "cover",
        z: 0,
        ...(properties ? { properties } : {}),
      },
    ],
  });
  return parsed.slots[0]!;
}

test("slotTextProps: layout lama tanpa properties = null (render tidak berubah)", () => {
  assert.equal(slotTextProps(slotOf()), null);
  assert.equal(slotTextProps(slotOf({ text: "   " })), null);
});

test("slotTextProps: teks + properti lain diteruskan", () => {
  const props = slotTextProps(slotOf({ text: "SNAPYOS", fontSize: 40, opacity: 0.5 }));
  assert.equal(props?.text, "SNAPYOS");
  assert.equal(props?.fontSize, 40);
  assert.equal(props?.opacity, 0.5);
});

test("drawSlotText: slot tanpa teks tidak memanggil fillText", () => {
  const { ctx, texts } = fakeContext();
  assert.equal(drawSlotText(ctx, slotOf(), 1), false);
  assert.deepEqual(texts, []);
});

test("drawSlotText: teks dirender di dalam area slot (JPEG final punya teks)", () => {
  const { ctx, texts } = fakeContext();
  assert.equal(drawSlotText(ctx, slotOf({ text: "SNAPYOS", fontSize: 40 }), 1), true);
  assert.ok(texts.length > 0, "fillText harus dipanggil");
  assert.equal(texts.map((t) => t.text).join(" "), "SNAPYOS");
  assert.ok(texts.every((t) => t.y >= 100 && t.y <= 300));
});

test("wrapText: membungkus sesuai lebar slot", () => {
  const { ctx } = fakeContext();
  const lines = wrapText(ctx, "BARIS SATU YANG CUKUP PANJANG SEKALI UNTUK DIBUNGKUS", 400, 5);
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(line.length <= 40, `baris terlalu panjang: ${line}`);
  }
});

test("drawSlotText: opacity dihormati", () => {
  const { ctx, texts } = fakeContext();
  drawSlotText(ctx, slotOf({ text: "HALF", opacity: 0.5 }), 1);
  assert.equal(texts[0]?.alpha, 0.5);
});

test("drawSlotText: skala preview mengikuti skala kanvas", () => {
  const { ctx, texts } = fakeContext();
  // scale 0.5 → posisi teks ikut mengecil proporsional
  drawSlotText(ctx, slotOf({ text: "S", fontSize: 40 }), 0.5);
  assert.ok(texts.every((t) => t.y >= 50 && t.y <= 150));
});
