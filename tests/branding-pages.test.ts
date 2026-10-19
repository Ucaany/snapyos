import test from "node:test";
import assert from "node:assert/strict";
import { resetPageOverrides } from "../src/lib/branding-pages.ts";

const pages = () => ({
  payment: { bg_color: "#000000", text_color: "#ffffff", align: "left" as const },
  edit: { bg_color: "#111111", video_key: "branding/edit.mp4" },
  result: { video_key: "branding/result.mp4", button_radius: 8 },
});

test("resetPageOverrides: tanpa daftar reset → objek sama (tanpa salinan)", () => {
  const p = pages();
  assert.equal(resetPageOverrides(p, []), p);
});

test("resetPageOverrides: hapus override visual layar", () => {
  const out = resetPageOverrides(pages(), ["payment"]);
  assert.equal(out.payment, undefined);
  assert.ok(out.edit);
  assert.ok(out.result);
});

test("resetPageOverrides: video_key dipertahankan, field visual dibuang", () => {
  const out = resetPageOverrides(pages(), ["result"]);
  assert.deepEqual(out.result, { video_key: "branding/result.mp4" });
});

test("resetPageOverrides: tidak memutasi objek masukan", () => {
  const p = pages();
  const snapshot = structuredClone(p);
  resetPageOverrides(p, ["payment", "edit"]);
  assert.deepEqual(p, snapshot);
});

test("resetPageOverrides: layar yang tidak ada diabaikan", () => {
  const out = resetPageOverrides(pages(), ["welcome", "guide"]);
  assert.deepEqual(out, pages());
});
