import test from "node:test";
import assert from "node:assert/strict";
import { kioskVisualStyle, type KioskBrandingConfig } from "../src/lib/kiosk-types.ts";

test("kioskVisualStyle: tanpa page, global defaults", () => {
  const s = kioskVisualStyle(undefined);
  assert.equal(s.bg, "#fffdf5");
  assert.equal(s.text, "#111111");
  assert.equal(s.fontScale, 1);
  assert.equal(s.radius, 0);
  assert.equal(s.padding, 24);
});

test("kioskVisualStyle: tanpa page, global override", () => {
  const k: KioskBrandingConfig = { bg_color: "#000000", text_color: "#ffffff", font_scale: 1.2, button_radius: 8, padding: 48 };
  const s = kioskVisualStyle(k);
  assert.equal(s.bg, "#000000");
  assert.equal(s.text, "#ffffff");
  assert.equal(s.fontScale, 1.2);
  assert.equal(s.radius, 8);
  assert.equal(s.padding, 48);
});

test("kioskVisualStyle: page tanpa override = global", () => {
  const k: KioskBrandingConfig = { bg_color: "#E0E0E0", text_color: "#222222" };
  const s = kioskVisualStyle(k, "capture");
  assert.equal(s.bg, "#E0E0E0");
  assert.equal(s.text, "#222222");
  assert.equal(s.fontScale, 1);
  assert.equal(s.radius, 0);
  assert.equal(s.padding, 24);
});

test("kioskVisualStyle: page override menimpa global", () => {
  const k: KioskBrandingConfig = {
    bg_color: "#E0E0E0",
    text_color: "#222222",
    font_scale: 1,
    pages: {
      capture: { bg_color: "#FF0000", text_color: "#00FF00", font_scale: 1.4, button_radius: 12, padding: 64 },
    },
  };
  const s = kioskVisualStyle(k, "capture");
  assert.equal(s.bg, "#FF0000");
  assert.equal(s.text, "#00FF00");
  assert.equal(s.fontScale, 1.4);
  assert.equal(s.radius, 12);
  assert.equal(s.padding, 64);
});

test("kioskVisualStyle: page override parsial (sebagian fallback global)", () => {
  const k: KioskBrandingConfig = {
    bg_color: "#E0E0E0",
    text_color: "#222222",
    font_scale: 1.1,
    pages: { result: { bg_color: "#0000FF" } },
  };
  const s = kioskVisualStyle(k, "result");
  assert.equal(s.bg, "#0000FF");
  assert.equal(s.text, "#222222");
  assert.equal(s.fontScale, 1.1);
  assert.equal(s.radius, 0);
  assert.equal(s.padding, 24);
});

test("kioskVisualStyle: page berbeda tidak terpengaruh", () => {
  const k: KioskBrandingConfig = {
    bg_color: "#E0E0E0",
    pages: { payment: { bg_color: "#FF0000" }, capture: { bg_color: "#00FF00" } },
  };
  const welcome = kioskVisualStyle(k, "welcome");
  const payment = kioskVisualStyle(k, "payment");
  const capture = kioskVisualStyle(k, "capture");
  assert.equal(welcome.bg, "#E0E0E0");
  assert.equal(payment.bg, "#FF0000");
  assert.equal(capture.bg, "#00FF00");
});

test("kioskVisualStyle: align global diteruskan ke semua page", () => {
  const k: KioskBrandingConfig = { align: "right" };
  assert.equal(kioskVisualStyle(k, "welcome").align, "right");
  assert.equal(kioskVisualStyle(k, "payment").align, "right");
  assert.equal(kioskVisualStyle(k, "capture").align, "right");
  assert.equal(kioskVisualStyle(k, "edit").align, "right");
  assert.equal(kioskVisualStyle(k, "result").align, "right");
});

test("kioskVisualStyle: align page override menimpa global", () => {
  const k: KioskBrandingConfig = {
    align: "left",
    pages: { welcome: { align: "center" }, result: { align: "right" } },
  };
  assert.equal(kioskVisualStyle(k, "welcome").align, "center");
  assert.equal(kioskVisualStyle(k, "result").align, "right");
  // Page tanpa override tetap pakai global.
  assert.equal(kioskVisualStyle(k, "payment").align, "left");
});

test("kioskVisualStyle: align undefined bila tidak diset (default per layar)", () => {
  const s = kioskVisualStyle(undefined, "welcome");
  assert.equal(s.align, undefined);
  const partial = kioskVisualStyle({ pages: { payment: { bg_color: "#0000FF" } } }, "payment");
  assert.equal(partial.align, undefined);
});