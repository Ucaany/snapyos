import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brandingHasOverride,
  mergeBranding,
  resolveBoothOverride,
} from "./branding-merge.ts";
import { isTenantBrandAssetKey } from "./validators.ts";

const BIZ = "11111111-1111-1111-1111-111111111111";
const BOOTH = "22222222-2222-2222-2222-222222222222";

void test("mergeBranding menggabungkan pages global + override per field", () => {
  const merged = mergeBranding(
    {
      welcome_title: "Global",
      kiosk: { bg_color: "#000000", pages: { welcome: { bg_color: "#111111", padding: 8 } } },
    },
    { kiosk: { pages: { welcome: { text_color: "#ffffff" } } } }
  );
  assert.equal(merged.welcome_title, "Global");
  assert.equal(merged.kiosk?.bg_color, "#000000");
  assert.deepEqual(merged.kiosk?.pages?.welcome, {
    bg_color: "#111111",
    padding: 8,
    text_color: "#ffffff",
  });
});

void test("mergeBranding mempertahankan null eksplisit (hapus video)", () => {
  const merged = mergeBranding(
    { kiosk: { video_key: "biz/branding/v.mp4" } },
    { kiosk: { video_key: null } }
  );
  assert.equal(merged.kiosk?.video_key, null);
});

void test("mergeBranding: string kosong/spasi = inherit, bukan override kosong", () => {
  const merged = mergeBranding(
    { welcome_title: "Global", welcome_button: "Mulai" },
    { welcome_title: "   ", welcome_button: "" }
  );
  assert.equal(merged.welcome_title, "Global");
  assert.equal(merged.welcome_button, "Mulai");
});

void test("resolveBoothOverride replace membuang string kosong", () => {
  const result = resolveBoothOverride(
    null,
    { welcome_title: "  ", logo_key: "biz/branding/logo.png" },
    "replace"
  );
  assert.deepEqual(result, { logo_key: "biz/branding/logo.png" });
  assert.equal(resolveBoothOverride(null, { welcome_title: "  " }, "replace"), null);
});

void test("brandingHasOverride: root kosong = false, null field = override eksplisit", () => {
  assert.equal(brandingHasOverride(null), false);
  assert.equal(brandingHasOverride(undefined), false);
  assert.equal(brandingHasOverride(""), false);
  assert.equal(brandingHasOverride("   "), false);
  assert.equal(brandingHasOverride({}), false);
  assert.equal(brandingHasOverride({ kiosk: {} }), false);
  assert.equal(brandingHasOverride({ welcome_title: "  " }), false);
  assert.equal(brandingHasOverride({ logo_key: null }), true);
  assert.equal(brandingHasOverride({ kiosk: { video_key: null } }), true);
  assert.equal(brandingHasOverride({ welcome_title: "Halo" }), true);
  assert.equal(brandingHasOverride({ kiosk: { bg_color: "#000000" } }), true);
});

void test("brandingHasOverride: array kosong = false, array berisi = rekursif", () => {
  assert.equal(brandingHasOverride({ tags: [] }), false);
  assert.equal(brandingHasOverride({ tags: ["a"] }), true);
  assert.equal(brandingHasOverride({ tags: [null] }), true);
});

void test("resolveBoothOverride replace mempertahankan null eksplisit (hapus video)", () => {
  const result = resolveBoothOverride(null, { kiosk: { video_key: null } }, "replace");
  assert.deepEqual(result, { kiosk: { video_key: null } });
  assert.equal(result?.kiosk?.video_key, null);
});

void test("isTenantBrandAssetKey menerima aset global + booth tenant sendiri", () => {
  assert.equal(isTenantBrandAssetKey(BIZ, `${BIZ}/branding/logo-1.png`), true);
  assert.equal(
    isTenantBrandAssetKey(BIZ, `${BIZ}/photoboxes/${BOOTH}/branding/logo-1.png`),
    true
  );
  assert.equal(
    isTenantBrandAssetKey(BIZ, `${BIZ}/photoboxes/${BOOTH}/branding/kiosk-video-1.mp4`),
    true
  );
});

void test("isTenantBrandAssetKey menolak tenant lain, traversal, backslash, key aneh", () => {
  assert.equal(isTenantBrandAssetKey(BIZ, `${BOOTH}/branding/logo.png`), false);
  assert.equal(isTenantBrandAssetKey(BIZ, `${BIZ}/branding/../${BOOTH}/x.png`), false);
  assert.equal(isTenantBrandAssetKey(BIZ, `${BIZ}/branding/..\\x.png`), false);
  assert.equal(isTenantBrandAssetKey(BIZ, `${BIZ}/branding/`), false);
  assert.equal(isTenantBrandAssetKey(BIZ, ""), false);
  assert.equal(isTenantBrandAssetKey(BIZ, `${BIZ}/branding/logo 1.png`), false);
  assert.equal(isTenantBrandAssetKey(BIZ, `${BIZ}/photoboxes/not-a-uuid/branding/x.png`), false);
  assert.equal(isTenantBrandAssetKey(BIZ, `${BIZ}/photoboxes/${BOOTH}/other/x.png`), false);
});
