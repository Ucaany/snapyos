import assert from "node:assert/strict";
import test from "node:test";

import {
  brandingColorsChanged,
  brandingHasOverride,
  foreignBrandAssetKeys,
  mergeBranding,
  resolveBoothOverride,
  unsetBrandingPaths,
} from "../src/lib/branding-merge.ts";
import { brandingContrastIssues } from "../src/lib/validators.ts";
import type { BrandingConfig } from "../src/lib/kiosk-types.ts";

const globalBranding: BrandingConfig = {
  welcome_title: "Global",
  welcome_tagline: "Tagline global",
  primary_color: "#FFD400",
  secondary_color: "#111111",
  kiosk: {
    bg_color: "#FFFDF5",
    text_color: "#111111",
    font_scale: 1,
    padding: 24,
    pages: {
      welcome: { bg_color: "#FFFDF5" },
      payment: { text_color: "#111111", align: "center" },
    },
  },
};

test("mergeBranding: override menang per field, field lain tetap global", () => {
  const merged = mergeBranding(globalBranding, {
    welcome_title: "Booth",
    kiosk: { bg_color: "#000000" },
  });
  assert.equal(merged.welcome_title, "Booth");
  assert.equal(merged.welcome_tagline, "Tagline global");
  assert.equal(merged.kiosk?.bg_color, "#000000");
  assert.equal(merged.kiosk?.text_color, "#111111");
  assert.equal(merged.kiosk?.padding, 24);
});

test("mergeBranding: pages digabung per layar dan per field", () => {
  const merged = mergeBranding(globalBranding, {
    kiosk: {
      pages: {
        welcome: { text_color: "#222222" },
        payment: { bg_color: "#000000" },
        edit: { padding: 12 },
      },
    },
  });
  assert.deepEqual(merged.kiosk?.pages?.welcome, {
    bg_color: "#FFFDF5",
    text_color: "#222222",
  });
  assert.deepEqual(merged.kiosk?.pages?.payment, {
    text_color: "#111111",
    align: "center",
    bg_color: "#000000",
  });
  assert.deepEqual(merged.kiosk?.pages?.edit, { padding: 12 });
});

test("mergeBranding: undefined berarti inherit, null adalah nilai eksplisit", () => {
  const merged = mergeBranding(
    { ...globalBranding, kiosk: { ...globalBranding.kiosk, video_key: "global.mp4" } },
    { kiosk: { video_key: null, font_scale: undefined } }
  );
  assert.equal(merged.kiosk?.video_key, null);
  assert.equal(merged.kiosk?.font_scale, 1);
});

test("brandingHasOverride: kosong/recursive kosong = false", () => {
  assert.equal(brandingHasOverride(null), false);
  assert.equal(brandingHasOverride(undefined), false);
  assert.equal(brandingHasOverride({}), false);
  assert.equal(brandingHasOverride({ kiosk: {} }), false);
  assert.equal(brandingHasOverride({ kiosk: { pages: {} } }), false);
  assert.equal(brandingHasOverride({ welcome_title: "Booth" }), true);
  assert.equal(brandingHasOverride({ kiosk: { pages: { edit: { padding: 4 } } } }), true);
  assert.equal(brandingHasOverride({ logo_key: null }), true);
});

test("resolveBoothOverride replace: pakai objek apa adanya, {} = reset", () => {
  const existing: BrandingConfig = {
    welcome_title: "Lama",
    kiosk: { bg_color: "#000000" },
  };
  const replaced = resolveBoothOverride(existing, { welcome_tagline: "Baru" }, "replace");
  assert.deepEqual(replaced, { welcome_tagline: "Baru" });
  assert.equal(resolveBoothOverride(existing, {}, "replace"), null);
  assert.equal(resolveBoothOverride(existing, null, "replace"), null);
});

test("resolveBoothOverride merge: input parsial menempel di atas override lama", () => {
  const existing: BrandingConfig = {
    welcome_title: "Lama",
    kiosk: { bg_color: "#000000", pages: { edit: { padding: 8 } } },
  };
  const merged = resolveBoothOverride(existing, { welcome_tagline: "Baru" }, "merge");
  assert.equal(merged?.welcome_title, "Lama");
  assert.equal(merged?.welcome_tagline, "Baru");
  assert.equal(merged?.kiosk?.bg_color, "#000000");
  assert.deepEqual(merged?.kiosk?.pages?.edit, { padding: 8 });
});

test("kontras efektif: override background gelap ditolak terhadap teks global", () => {
  const effective = mergeBranding(globalBranding, {
    kiosk: { bg_color: "#000000" },
  });
  const issues = brandingContrastIssues(effective as never);
  assert.ok(issues.length > 0);
  assert.ok(issues.some((issue) => issue.path.join(".") === "kiosk.text_color"));
});

test("kontras efektif: override per-layar dibandingkan dengan teks layar efektif", () => {
  const effective = mergeBranding(globalBranding, {
    kiosk: { pages: { payment: { bg_color: "#000000" } } },
  });
  const issues = brandingContrastIssues(effective as never);
  assert.ok(issues.some((issue) => issue.path.join(".") === "kiosk.pages.payment.text_color"));
});

test("kontras efektif: tanpa override tidak ada issue", () => {
  assert.deepEqual(brandingContrastIssues(globalBranding as never), []);
});

test("foreignBrandAssetKeys: menolak key milik business lain", () => {
  assert.deepEqual(foreignBrandAssetKeys("biz-a", { logo_key: "biz-b/branding/x.png" }), [
    "biz-b/branding/x.png",
  ]);
  assert.deepEqual(
    foreignBrandAssetKeys("biz-a", {
      logo_key: "biz-a/branding/x.png",
      kiosk: { video_key: "biz-b/branding/v.mp4", pages: { edit: { video_key: "biz-b/x.mp4" } } },
    }),
    ["biz-b/branding/v.mp4", "biz-b/x.mp4"]
  );
  assert.deepEqual(foreignBrandAssetKeys("biz-a", { logo_key: null, kiosk: {} }), []);
});

test("unsetBrandingPaths: hapus key top-level, kiosk, dan per-layar", () => {
  const out = unsetBrandingPaths(globalBranding, [
    "kiosk.video_key",
    "kiosk.show_logo",
    "kiosk.pages.payment.text_color",
    "logo_key",
  ]);
  assert.equal(out.kiosk?.video_key, undefined);
  assert.equal(out.kiosk?.show_logo, undefined);
  assert.deepEqual(out.kiosk?.pages?.payment, { align: "center" });
  assert.equal(out.kiosk?.text_color, "#111111");
  assert.ok(globalBranding.kiosk?.text_color, "masukan tidak boleh termutasi");
});

test("unsetBrandingPaths: path yang tidak ada diabaikan", () => {
  const out = unsetBrandingPaths(globalBranding, ["kiosk.tidak_ada", "a.b.c.d.e"]);
  assert.deepEqual(out, globalBranding);
});

test("brandingColorsChanged: hanya warna kiosk/layar yang dihitung", () => {
  assert.equal(brandingColorsChanged(globalBranding, globalBranding), false);
  assert.equal(
    brandingColorsChanged(globalBranding, { ...globalBranding, welcome_title: "Lain" }),
    false
  );
  assert.equal(
    brandingColorsChanged(globalBranding, {
      ...globalBranding,
      kiosk: { ...globalBranding.kiosk, bg_color: "#000000" },
    }),
    true
  );
  assert.equal(
    brandingColorsChanged(globalBranding, {
      ...globalBranding,
      kiosk: {
        ...globalBranding.kiosk,
        pages: { ...globalBranding.kiosk?.pages, edit: { bg_color: "#000000" } },
      },
    }),
    true
  );
});

test("getResult membaca logo dari business_settings, bukan businesses.branding", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("src/server/kiosk-sessions.ts", "utf8");
  assert.doesNotMatch(
    source,
    /from\("businesses"\)\s*\.select\("name, branding"\)/,
    "tabel businesses tidak punya kolom branding — query ini gagal dan logo jadi null"
  );
  assert.match(source, /business_settings[\s\S]{0,200}logo_key/);
});

test("override booth yang direset/hapus membersihkan blob logo+video", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("src/server/photoboxes.ts", "utf8");
  assert.match(source, /boothBrandingKeys/, "key aset booth harus diturunkan dari branding");
  assert.match(source, /purgeBrandBlobs\(businessId, boothBrandingKeys\(existing\?\.branding\)\)/);
  assert.match(source, /accountStorageSub/);
});
