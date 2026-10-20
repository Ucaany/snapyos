import test from "node:test";
import assert from "node:assert/strict";
import {
  kioskThemeVars,
  kioskVisualStyle,
  KIOSK_FONT_FAMILIES,
  type KioskBrandingConfig,
} from "../src/lib/kiosk-types.ts";
import { brandingContrastIssues } from "../src/lib/validators.ts";
import { cardSurface, contrastRatio, readableText } from "../src/lib/color.ts";

test("kioskVisualStyle: tanpa page, global defaults", () => {
  const s = kioskVisualStyle(undefined);
  assert.equal(s.bg, "#fffdf5");
  assert.equal(s.text, "#111111");
  assert.equal(s.fontScale, 1);
  assert.equal(s.radius, 0);
  assert.equal(s.padding, 24);
});

test("kioskVisualStyle: tanpa page, global override", () => {
  const k: KioskBrandingConfig = {
    bg_color: "#000000",
    text_color: "#ffffff",
    font_scale: 1.2,
    button_radius: 8,
    padding: 48,
  };
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
      capture: {
        bg_color: "#FF0000",
        text_color: "#00FF00",
        font_scale: 1.4,
        button_radius: 12,
        padding: 64,
      },
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

test("kioskVisualStyle: font_family mono TIDAK diturunkan ke sans", () => {
  const mono = kioskVisualStyle({ font_family: "mono" });
  assert.equal(mono.fontFamily, KIOSK_FONT_FAMILIES.mono);
  const display = kioskVisualStyle({ font_family: "display" });
  assert.equal(display.fontFamily, KIOSK_FONT_FAMILIES.display);
  const dflt = kioskVisualStyle(undefined);
  assert.equal(dflt.fontFamily, KIOSK_FONT_FAMILIES.display);
});

test("kioskVisualStyle: accent/primary meneruskan warna brand", () => {
  const s = kioskVisualStyle(undefined, undefined, { primary: "#ff00ff", secondary: "#00ff00" });
  assert.equal(s.accent, "#ff00ff");
  assert.equal(s.primary, "#00ff00");
  // fallback default saat brand tidak diberikan
  const d = kioskVisualStyle(undefined);
  assert.ok(d.accent.length > 0);
  assert.ok(d.primary.length > 0);
});

test("brandingContrastIssues: menandai pasangan kontras rendah (global + per-layar)", () => {
  const issues = brandingContrastIssues({
    kiosk: {
      bg_color: "#ffffff",
      text_color: "#eeeeee",
      pages: { guide: { bg_color: "#ffffff", text_color: "#aaaaaa" } },
    },
  });
  assert.ok(issues.length >= 2, `expected >=2 issues, got ${issues.length}`);
  assert.ok(issues.some((i) => i.path.join(".") === "kiosk.text_color"));
  assert.ok(issues.some((i) => i.path.join(".") === "kiosk.pages.guide.text_color"));
});

test("brandingContrastIssues: kontras cukup tidak menghasilkan issue", () => {
  const issues = brandingContrastIssues({
    kiosk: {
      bg_color: "#000000",
      text_color: "#ffffff",
      pages: { guide: { bg_color: "#004d00" } },
    },
  });
  assert.equal(issues.length, 0);
});
test("kioskVisualStyle: surface diturunkan dari bg, bukan putih paksa", () => {
  const s = kioskVisualStyle({ bg_color: "#000000", text_color: "#ffffff" });
  assert.notEqual(s.surface, "#ffffff");
  assert.notEqual(s.surface, "#000000");
  // teks di atas surface tetap kontras AA
  assert.ok(contrastRatio(s.surfaceText, s.surface) >= 4.5);
});

test("kioskVisualStyle: accentText memilih teks yang terbaca di atas accent", () => {
  const light = kioskVisualStyle(undefined, undefined, {
    primary: "#ffd400",
    secondary: "#111111",
  });
  assert.ok(contrastRatio(light.accentText, light.accent) >= 4.5);
  const dark = kioskVisualStyle(undefined, undefined, { primary: "#111111", secondary: "#111111" });
  assert.ok(contrastRatio(dark.accentText, dark.accent) >= 4.5);
});

test("kioskVisualStyle: payment_align legacy dibaca hanya bila align belum diset", () => {
  assert.equal(kioskVisualStyle({ payment_align: "center" }).align, "center");
  // align eksplisit menang atas field legacy
  assert.equal(kioskVisualStyle({ align: "right", payment_align: "center" }).align, "right");
});

test("kioskVisualStyle: surface ikut override bg per layar", () => {
  const k: KioskBrandingConfig = {
    bg_color: "#fffdf5",
    text_color: "#111111",
    pages: { payment: { bg_color: "#001122", text_color: "#eeeeee" } },
  };
  const global = kioskVisualStyle(k);
  const payment = kioskVisualStyle(k, "payment");
  assert.notEqual(payment.surface, global.surface);
  assert.ok(contrastRatio(payment.surfaceText, payment.surface) >= 4.5);
});

test("color: contrastRatio & readableText", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("nope", "#ffffff"), 1);
  // kuning terang: teks gelap dipilih
  assert.equal(readableText("#ffd400", "#ffffff"), "#111111");
  // latar gelap: teks terang dipilih
  assert.equal(readableText("#111111", "#111111"), "#ffffff");
  assert.ok(contrastRatio(readableText("#ffd400", "#777777"), "#ffd400") >= 4.5);
});

test("color: cardSurface mencampur bg dengan teks", () => {
  assert.equal(cardSurface("#000000", "#ffffff"), "#0f0f0f");
  assert.equal(cardSurface("#ffffff", "#000000"), "#f0f0f0");
  // input tidak valid → bg apa adanya
  assert.equal(cardSurface("nope", "#000000"), "nope");
});

test("kioskVisualStyle: mutedText tetap AA di palet gelap maupun terang", () => {
  const dark = kioskVisualStyle({ bg_color: "#101820", text_color: "#F2E9DC" });
  assert.ok(contrastRatio(dark.mutedText, dark.bg) >= 4.5, `dark muted ${dark.mutedText}`);
  const light = kioskVisualStyle({ bg_color: "#FFFDF5", text_color: "#111111" });
  assert.ok(contrastRatio(light.mutedText, light.bg) >= 4.5, `light muted ${light.mutedText}`);
  // tetap lebih redup daripada teks utama (bukan sekadar menyalin `text`)
  assert.notEqual(light.mutedText, light.text);
});

test("kioskThemeVars: memetakan surface/ink/muted untuk subtree layar", () => {
  const s = kioskVisualStyle({ bg_color: "#101820", text_color: "#F2E9DC" });
  const vars = kioskThemeVars(s);
  assert.equal(vars["--color-surface"], s.surface);
  assert.equal(vars["--color-ink"], s.surfaceText);
  assert.equal(vars["--color-muted-foreground"], s.mutedText);
  assert.equal(vars["--color-muted"], s.mutedSurface);
});
