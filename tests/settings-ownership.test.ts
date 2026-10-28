/**
 * Pemisahan setelan: kustomisasi booth vs informasi cloud.
 *
 * Flow yang dikunci berkas ini:
 *
 * 1. **Aplikasi booth** menyimpan setelan teknis satu booth (kamera, printer,
 *    sesi, tampilan) di store lokal, dan panel setelan menulis lewat
 *    `PUT /v1/settings`.
 * 2. **Cloud (website)** memegang informasi yang harus sama di semua booth:
 *    harga, paket, payment gateway, logo, warna brand, video.
 * 3. Kustomisasi tampilan booth TIDAK boleh naik ke cloud — kalau naik, satu
 *    booth yang mengganti warna latar akan menimpa seluruh booth di business.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APPEARANCE_FIELDS,
  APPEARANCE_PAGES,
  mergeAppearance,
  pickAppearance,
  type AppearanceSettings,
} from "../src/lib/appearance-merge.ts";
import { mergeSettings } from "../src/lib/settings-merge.ts";
import { boothDraftToSettings } from "../src/lib/booth-settings-payload.ts";
import {
  CLOUD_OWNED_SETTING_FIELDS,
  CLOUD_SYNCED_DEVICE_GROUPS,
  DEVICE_SETTING_GROUPS,
  LOCAL_ONLY_DEVICE_GROUPS,
  appearanceSettingsSchema,
  deviceSettingFields,
  deviceSettingsSchema,
  foreignSettingKeys,
  isLocalOnlySettingGroup,
  localOnlySettingKeys,
} from "../src/lib/validators.ts";

// ---------------------------------------------------------------------------
// 1. Kontrak kepemilikan
// ---------------------------------------------------------------------------

test("appearance_settings adalah grup milik booth", () => {
  assert.ok(
    (DEVICE_SETTING_GROUPS as readonly string[]).includes("appearance_settings"),
    "appearance_settings harus terdaftar sebagai grup setelan booth"
  );
  assert.ok(isLocalOnlySettingGroup("appearance_settings"));
});

test("appearance_settings TIDAK ikut disinkronkan ke cloud", () => {
  assert.ok(
    !(CLOUD_SYNCED_DEVICE_GROUPS as readonly string[]).includes("appearance_settings"),
    "kustomisasi tampilan tidak boleh naik ke cloud"
  );
  assert.deepEqual([...LOCAL_ONLY_DEVICE_GROUPS], ["appearance_settings"]);
});

test("tiga grup mesin tetap disinkronkan ke cloud", () => {
  // Regresi: kalau grup ini ikut hilang, laporan setelan dari booth berhenti
  // dan dashboard owner menampilkan nilai basi.
  for (const group of ["camera_settings", "print_settings", "session_settings"] as const) {
    assert.ok((CLOUD_SYNCED_DEVICE_GROUPS as readonly string[]).includes(group), group);
  }
});

test("localOnlySettingKeys hanya menyebut grup lokal", () => {
  assert.deepEqual(localOnlySettingKeys({ appearance_settings: {}, camera_settings: {} }), [
    "appearance_settings",
  ]);
  assert.deepEqual(localOnlySettingKeys({ camera_settings: {}, print_settings: {} }), []);
});

// ---------------------------------------------------------------------------
// 2. Field milik cloud tidak bisa ditulis booth
// ---------------------------------------------------------------------------

test("copies dan layout tetap milik cloud di dalam print_settings", () => {
  const owned = CLOUD_OWNED_SETTING_FIELDS.print_settings;
  assert.ok(owned.includes("copies"), "copies = biaya bahan, milik cloud");
  assert.ok(owned.includes("layout"), "layout = bentuk produk, milik cloud");

  const deviceFields = deviceSettingFields("print_settings");
  assert.ok(!deviceFields.includes("copies"), "booth tidak boleh menulis copies");
  assert.ok(!deviceFields.includes("layout"), "booth tidak boleh menulis layout");
  // Field mesin tetap boleh.
  assert.ok(deviceFields.includes("paper_size"));
  assert.ok(deviceFields.includes("printer_name"));
});

test("payload booth yang membawa copies ditolak sebagai field cloud", () => {
  const foreign = foreignSettingKeys({ print_settings: { copies: 3, paper_size: "A6" } });
  assert.deepEqual(foreign, ["print_settings.copies"]);
});

test("field tampilan booth semuanya boleh ditulis booth", () => {
  const allowed = new Set(deviceSettingFields("appearance_settings"));
  for (const field of APPEARANCE_FIELDS) {
    assert.ok(allowed.has(field), `appearance_settings.${field} harus boleh ditulis booth`);
  }
  // Tidak ada satu pun field tampilan yang disita cloud.
  assert.deepEqual([...CLOUD_OWNED_SETTING_FIELDS.appearance_settings], []);
});

test("schema appearance menolak warna non-hex", () => {
  const bad = appearanceSettingsSchema.safeParse({ bg_color: "hitam" });
  assert.equal(bad.success, false);
  const good = appearanceSettingsSchema.safeParse({ bg_color: "#112233" });
  assert.equal(good.success, true);
});

test("schema appearance menolak font_scale di luar 0.8–1.4", () => {
  assert.equal(appearanceSettingsSchema.safeParse({ font_scale: 0.5 }).success, false);
  assert.equal(appearanceSettingsSchema.safeParse({ font_scale: 2 }).success, false);
  assert.equal(appearanceSettingsSchema.safeParse({ font_scale: 1.2 }).success, true);
});

// ---------------------------------------------------------------------------
// 3. Merge: booth menang atas cloud, identitas cloud tidak hilang
// ---------------------------------------------------------------------------

const cloudBranding = {
  welcome_title: "Judul dari Website",
  welcome_tagline: "Tagline website",
  welcome_button: "MULAI",
  primary_color: "#ff0000",
  secondary_color: "#111111",
  logo_url: "https://cdn.example.test/logo.png",
  kiosk: {
    bg_color: "#ffffff",
    text_color: "#000000",
    font_scale: 1,
    padding: 24,
    video_url: "https://cdn.example.test/promo.mp4",
    guide_steps: ["Langkah website"],
    pages: {
      payment: { bg_color: "#eeeeee", video_url: "https://cdn.example.test/pay.mp4" },
    },
  },
};

test("tanpa kustomisasi booth, branding cloud dipakai apa adanya", () => {
  assert.deepEqual(mergeAppearance(cloudBranding, null), cloudBranding);
  assert.deepEqual(mergeAppearance(cloudBranding, {}), cloudBranding);
});

test("kustomisasi booth menang atas branding cloud", () => {
  const merged = mergeAppearance(cloudBranding, {
    bg_color: "#123456",
    font_scale: 1.2,
    padding: 48,
    welcome_title: "Judul Booth Ini",
  });

  assert.equal(merged.kiosk?.bg_color, "#123456");
  assert.equal(merged.kiosk?.font_scale, 1.2);
  assert.equal(merged.kiosk?.padding, 48);
  assert.equal(merged.welcome_title, "Judul Booth Ini");
});

test("identitas cloud tidak hilang saat booth hanya mengubah satu field", () => {
  const merged = mergeAppearance(cloudBranding, { bg_color: "#123456" });

  // Milik cloud — harus utuh.
  assert.equal(merged.primary_color, "#ff0000");
  assert.equal(merged.secondary_color, "#111111");
  assert.equal(merged.logo_url, "https://cdn.example.test/logo.png");
  assert.equal(merged.kiosk?.video_url, "https://cdn.example.test/promo.mp4");
  assert.equal(merged.welcome_tagline, "Tagline website");
  // Field lain milik cloud yang tidak disentuh booth tetap nilai cloud.
  assert.equal(merged.kiosk?.text_color, "#000000");
  assert.deepEqual(merged.kiosk?.guide_steps, ["Langkah website"]);
});

test("override per-layar digabung, video cloud dipertahankan", () => {
  const merged = mergeAppearance(cloudBranding, {
    pages: { payment: { bg_color: "#abcdef" } },
  });

  const page = merged.kiosk?.pages?.payment;
  assert.equal(page?.bg_color, "#abcdef", "booth menang untuk warna latar layar");
  assert.equal(
    page?.video_url,
    "https://cdn.example.test/pay.mp4",
    "video tetap milik cloud — mesin tidak boleh mengarang objek storage"
  );
});

test("booth bisa menambah override layar yang belum diatur cloud", () => {
  const merged = mergeAppearance(cloudBranding, {
    pages: { result: { text_color: "#00ff00", align: "center" } },
  });
  assert.deepEqual(merged.kiosk?.pages?.result, { text_color: "#00ff00", align: "center" });
  // Override cloud untuk layar lain tidak hilang.
  assert.equal(merged.kiosk?.pages?.payment?.bg_color, "#eeeeee");
});

test("mergeAppearance tidak memutasi masukan", () => {
  const cloud = structuredClone(cloudBranding);
  const appearance: AppearanceSettings = { bg_color: "#000000" };
  const snapshotCloud = structuredClone(cloud);
  const snapshotAppearance = structuredClone(appearance);

  mergeAppearance(cloud, appearance);

  assert.deepEqual(cloud, snapshotCloud);
  assert.deepEqual(appearance, snapshotAppearance);
});

test("booth tanpa branding cloud tetap menghasilkan objek sah", () => {
  const merged = mergeAppearance(null, { bg_color: "#101010" });
  assert.equal(merged.kiosk?.bg_color, "#101010");
});

// ---------------------------------------------------------------------------
// 4. pickAppearance menyaring field asing
// ---------------------------------------------------------------------------

test("pickAppearance membuang field yang bukan milik tampilan", () => {
  const picked = pickAppearance({
    bg_color: "#111111",
    // Bukan milik tampilan booth — jangan pernah ikut tersimpan.
    copies: 5,
    payment_mode: "voucher",
    price: 50000,
  });
  assert.deepEqual(picked, { bg_color: "#111111" });
});

test("pickAppearance membuang video_key (objek storage milik cloud)", () => {
  const picked = pickAppearance({ bg_color: "#111111", video_key: "branding/x.mp4" });
  assert.deepEqual(picked, { bg_color: "#111111" });
});

test("pickAppearance hanya menerima layar yang dikenal", () => {
  const picked = pickAppearance({
    pages: {
      payment: { bg_color: "#222222" },
      layar_asing: { bg_color: "#333333" },
    },
  });
  assert.deepEqual(Object.keys(picked.pages ?? {}), ["payment"]);
});

test("semua layar kiosk bisa di-override", () => {
  for (const page of APPEARANCE_PAGES) {
    const picked = pickAppearance({ pages: { [page]: { padding: 8 } } });
    assert.ok(picked.pages?.[page], `layar ${page} harus bisa di-override`);
  }
});

// ---------------------------------------------------------------------------
// 5. Kiosk: setelan booth menang, field uang tetap milik cloud
// ---------------------------------------------------------------------------

test("kiosk memakai appearance booth di atas branding cloud", () => {
  const device = {
    appearance_settings: { bg_color: "#0f0f0f", padding: 40 },
  };
  const merged = mergeAppearance(cloudBranding, device.appearance_settings);
  assert.equal(merged.kiosk?.bg_color, "#0f0f0f");
  assert.equal(merged.kiosk?.padding, 40);
});

test("runtime mati: branding cloud dipakai, kiosk tetap jalan", () => {
  const merged = mergeAppearance(cloudBranding, null);
  assert.equal(merged.kiosk?.bg_color, "#ffffff");
  assert.equal(merged.welcome_title, "Judul dari Website");
});

test("mergeSettings tetap menolak appearance menimpa field uang", () => {
  // `copies`/`layout` milik cloud meski device mengirim grup print_settings.
  const merged = mergeSettings(
    { print_settings: { copies: 2, layout: "strip" } } as Record<string, unknown>,
    { print_settings: { copies: 9, layout: "single", paper_size: "A6" } }
  ) as { print_settings: Record<string, unknown> };
  assert.equal(merged.print_settings.copies, 2, "copies milik cloud");
  assert.equal(merged.print_settings.layout, "strip", "layout milik cloud");
  assert.equal(merged.print_settings.paper_size, "A6", "paper_size milik booth");
});

// ---------------------------------------------------------------------------
// 6. Payload panel setelan booth
// ---------------------------------------------------------------------------

const baseDraft = {
  camera: {
    provider: "bridge" as const,
    countdown_seconds: 5,
    capture_width: 1920,
    capture_height: 1080,
    mirror_preview: true,
    screen_orientation: "portrait" as const,
    chroma_key_enabled: true,
  },
  print: {
    enabled: true,
    mode: "cups" as const,
    paper_size: "A6" as const,
    orientation: "portrait" as const,
    auto_print: true,
    margins_mm: 2,
    printer_name: "  DNP QW410  ",
  },
  session: { timer_seconds: 300, warning_seconds: 60, max_retakes: 2 },
  appearance: {
    bg_color: "#101820",
    text_color: "#f0f0f0",
    font_scale: 1.1,
    button_radius: 4,
    padding: 32,
    welcome_title: "  Halo  ",
    welcome_tagline: "",
    guide_steps: "Langkah satu\n\n  Langkah dua  \n",
  },
};

test("payload panel tidak pernah membawa copies atau layout", () => {
  const payload = boothDraftToSettings(baseDraft);
  assert.equal(
    (payload.print_settings as Record<string, unknown>).copies,
    undefined,
    "copies milik cloud, tidak boleh dikirim panel booth"
  );
  assert.equal(
    (payload.print_settings as Record<string, unknown>).layout,
    undefined,
    "layout milik cloud, tidak boleh dikirim panel booth"
  );
});

test("payload panel tidak membawa harga, paket, atau payment gateway", () => {
  const payload = boothDraftToSettings(baseDraft);
  const keys = Object.keys(payload).sort();
  assert.deepEqual(keys, [
    "appearance_settings",
    "camera_settings",
    "print_settings",
    "session_settings",
  ]);
  const flat = JSON.stringify(payload);
  for (const forbidden of ["payment_mode", "price", "package", "gateway", "merchant_id"]) {
    assert.ok(!flat.includes(forbidden), `payload tidak boleh membawa ${forbidden}`);
  }
});

test("payload panel merapikan nilai teks dan panduan", () => {
  const payload = boothDraftToSettings(baseDraft);
  assert.equal(
    (payload.print_settings as Record<string, unknown>).printer_name,
    "DNP QW410",
    "spasi tepi dibuang"
  );
  assert.equal((payload.appearance_settings as Record<string, unknown>).welcome_title, "Halo");
  // Tagline kosong tidak dikirim supaya nilai cloud tidak tertimpa string kosong.
  assert.equal((payload.appearance_settings as Record<string, unknown>).welcome_tagline, undefined);
  assert.deepEqual((payload.appearance_settings as Record<string, unknown>).guide_steps, [
    "Langkah satu",
    "Langkah dua",
  ]);
});

test("payload panel membatasi panduan maksimal 8 langkah", () => {
  const payload = boothDraftToSettings({
    ...baseDraft,
    appearance: {
      ...baseDraft.appearance,
      guide_steps: Array.from({ length: 20 }, (_, i) => `Langkah ${i + 1}`).join("\n"),
    },
  });
  const steps = (payload.appearance_settings as Record<string, unknown>).guide_steps as string[];
  assert.equal(steps.length, 8);
});

test("payload panel tanpa nama printer tidak mengirim kunci kosong", () => {
  const payload = boothDraftToSettings({
    ...baseDraft,
    print: { ...baseDraft.print, printer_name: "   " },
  });
  assert.equal(
    "printer_name" in (payload.print_settings as Record<string, unknown>),
    false,
    "printer_name kosong = biarkan nilai tersimpan"
  );
});

test("max_retakes null dikirim sebagai null (tanpa batas)", () => {
  const payload = boothDraftToSettings({
    ...baseDraft,
    session: { ...baseDraft.session, max_retakes: null },
  });
  assert.equal((payload.session_settings as Record<string, unknown>).max_retakes, null);
});

test("payload panel lolos schema device (tidak ada kunci asing)", () => {
  const payload = boothDraftToSettings(baseDraft);
  assert.deepEqual(foreignSettingKeys(payload as Record<string, unknown>), []);
  assert.equal(deviceSettingsSchema.safeParse(payload).success, true);
});

// ---------------------------------------------------------------------------
// 7. Dokumentasi harus sesuai kode
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = process.cwd();
const read = (p: string) => readFileSync(join(repo, p), "utf8");

test("dokumen menyebut appearance_settings sebagai milik booth", () => {
  const owner = read("docs/04-owner-dashboard.md");
  assert.ok(
    owner.includes("appearance_settings"),
    "04-owner-dashboard harus menyebut grup tampilan"
  );
  assert.ok(
    owner.includes("LOCAL_ONLY_SETTING"),
    "dokumen harus menyebut penolakan cloud untuk setelan lokal"
  );

  const kiosk = read("docs/05-customer-photobox.md");
  assert.ok(kiosk.includes("appearance-merge"), "05 harus menunjuk modul merge yang sebenarnya");
});

test("status.md mencatat panel setelan booth dan kustomisasi mesin", () => {
  const status = read("docs/status.md");
  assert.ok(status.includes("BoothSettingsPanel"), "status harus menyebut panel setelan");
  assert.ok(status.includes("appearance-merge"), "status harus menyebut merge tampilan");
});

test("modul yang dirujuk dokumen benar-benar ada", () => {
  for (const file of [
    "src/lib/appearance-merge.ts",
    "src/lib/booth-settings-payload.ts",
    "src/components/kiosk/BoothSettingsPanel.tsx",
  ]) {
    assert.ok(read(file).length > 0, `${file} harus ada`);
  }
});
