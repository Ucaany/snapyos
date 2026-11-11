/**
 * Kontrak jalur cetak bertingkat (`print_settings.photo|thermal|receipt`),
 * setelan kamera pilihan booth, dan output digital.
 *
 * Yang dikunci berkas ini:
 *
 * 1. Grup bersarang diterima schema dan dianggap milik device, tetapi
 *    `copies`/`layout` tetap milik cloud — termasuk saat diselipkan ke dalam
 *    grup bersarang.
 * 2. Baris lama yang hanya punya field datar tetap sah (fallback).
 * 3. Merge per-sub-key: booth yang mengirim `photo.printer_name` tidak
 *    menghapus `photo.paper_size` milik cloud.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { boothDraftToSettings } from "../src/lib/booth-settings-payload.ts";
import { mergeSettings } from "../src/lib/settings-merge.ts";
import {
  CLOUD_OWNED_SETTING_FIELDS,
  businessSettingsUpdateSchema,
  deviceSettingFields,
  deviceSettingsSchema,
  foreignSettingKeys,
  gifOutputSettingsSchema,
  mergeDeviceSettings,
  printSettingsSchema,
} from "../src/lib/validators.ts";

const legacyFlat = {
  enabled: true,
  mode: "cups",
  paper_size: "4x6",
  printer_name: "DNP QW410",
  bluetooth_paper_width_mm: 58,
};

test("baris datar lama tetap sah (fallback field datar)", () => {
  const parsed = printSettingsSchema.safeParse(legacyFlat);
  assert.equal(parsed.success, true);
});

test("print_settings menerima tiga grup jalur cetak", () => {
  const parsed = printSettingsSchema.safeParse({
    photo: { enabled: true, mode: "cups", printer_name: "DNP", paper_size: "4x6" },
    thermal: { enabled: true, paper_width_mm: 58, auto_print: true },
    receipt: { mode: "cups", paper_width_mm: 80, enabled: false },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.thermal?.paper_width_mm, 58);
  assert.equal(parsed.data?.receipt?.paper_width_mm, 80);
});

test("lebar thermal hanya 58 atau 80 mm", () => {
  assert.equal(printSettingsSchema.safeParse({ thermal: { paper_width_mm: 60 } }).success, false);
  assert.equal(printSettingsSchema.safeParse({ receipt: { paper_width_mm: 110 } }).success, false);
});

test("grup bersarang terdaftar sebagai field device", () => {
  const fields = deviceSettingFields("print_settings");
  for (const group of ["photo", "thermal", "receipt"]) {
    assert.ok(fields.includes(group), `print_settings.${group} harus boleh ditulis booth`);
  }
  assert.deepEqual(foreignSettingKeys({ print_settings: { photo: {} } }), []);
  assert.deepEqual(foreignSettingKeys({ print_settings: { cut: true } }), ["print_settings.cut"]);
});

test("copies dan layout tetap milik cloud", () => {
  assert.deepEqual([...CLOUD_OWNED_SETTING_FIELDS.print_settings], ["copies", "layout"]);
  const fields = deviceSettingFields("print_settings");
  assert.ok(!fields.includes("copies"));
  assert.ok(!fields.includes("layout"));
});

test("copies yang diselipkan ke grup bersarang dibuang schema", () => {
  const parsed = deviceSettingsSchema.safeParse({
    print_settings: { photo: { copies: 9, printer_name: "DNP" } },
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data?.print_settings?.photo, { printer_name: "DNP" });
});

test("merge device: sub-key booth menang, sub-key cloud tidak hilang", () => {
  const cloud = {
    status: "active",
    print_settings: {
      copies: 2,
      layout: "strip",
      paper_size: "4x6",
      photo: { paper_size: "4x6", printer_name: "Printer Cloud", fit: "contain" },
    },
  };
  const merged = mergeDeviceSettings(cloud, {
    print_settings: { photo: { printer_name: "Printer Booth" } },
  });
  const print = merged.print_settings as Record<string, unknown>;
  assert.equal(print.copies, 2, "copies milik cloud");
  assert.equal(print.paper_size, "4x6", "field datar cloud tetap ada");
  assert.deepEqual(print.photo, {
    paper_size: "4x6",
    printer_name: "Printer Booth",
    fit: "contain",
  });
});

test("mergeSettings kiosk memakai aturan yang sama", () => {
  const cloud = {
    print_settings: {
      copies: 3,
      thermal: { paper_width_mm: 80, printer_name: "Cloud" },
    },
  };
  const merged = mergeSettings(cloud, {
    print_settings: { thermal: { printer_name: "Booth" } },
  });
  assert.deepEqual(merged.print_settings.thermal, {
    paper_width_mm: 80,
    printer_name: "Booth",
  });
  assert.equal(merged.print_settings.copies, 3);
});

test("merge tidak memutasi objek cloud", () => {
  const cloud = { print_settings: { photo: { fit: "cover" } } };
  mergeSettings(cloud, { print_settings: { photo: { fit: "contain" } } });
  assert.equal(cloud.print_settings.photo.fit, "cover");
});

test("payload booth membawa jalur cetak, kamera pilihan, dan bridge", () => {
  const payload = boothDraftToSettings({
    camera: {
      provider: "bridge",
      countdown_seconds: 3,
      capture_width: 1920,
      capture_height: 1080,
      mirror_preview: true,
      screen_orientation: "landscape",
      preferred_device_id: "  cam-1  ",
    },
    print: {
      enabled: true,
      mode: "cups",
      paper_size: "4x6",
      orientation: "portrait",
      auto_print: true,
      margins_mm: 2,
      printer_name: "DNP QW410",
      bluetooth_paper_width_mm: 58,
      bluetooth_device_name: "  XP-58  ",
      bridge_url: "http://127.0.0.1:17777",
      photo: { enabled: true, mode: "cups", printer_name: "DNP QW410" },
      thermal: { enabled: true, paper_width_mm: 58, auto_print: true },
      receipt: { mode: "cups", paper_width_mm: 58, enabled: true },
    },
    session: { timer_seconds: 300, warning_seconds: 60, max_retakes: 2 },
    appearance: {
      bg_color: "#101820",
      text_color: "#f0f0f0",
      font_scale: 1,
      button_radius: 0,
      padding: 24,
      welcome_title: "",
      welcome_tagline: "",
      guide_steps: "",
    },
  });

  assert.equal(payload.camera_settings.preferred_device_id, "cam-1");
  assert.equal(payload.print_settings.bluetooth_paper_width_mm, 58);
  assert.equal(payload.print_settings.bluetooth_device_name, "XP-58");
  assert.equal(payload.print_settings.bridge_url, "http://127.0.0.1:17777");
  assert.deepEqual(payload.print_settings.photo, {
    enabled: true,
    mode: "cups",
    printer_name: "DNP QW410",
  });
  assert.deepEqual(payload.print_settings.thermal, {
    enabled: true,
    paper_width_mm: 58,
    auto_print: true,
  });
  assert.equal(payload.print_settings.copies, undefined);
  assert.equal(payload.print_settings.layout, undefined);
  assert.deepEqual(foreignSettingKeys(payload as Record<string, unknown>), []);
  assert.equal(deviceSettingsSchema.safeParse(payload).success, true);
});

test("payload booth tanpa grup bersarang tidak mengarang kunci", () => {
  const payload = boothDraftToSettings({
    camera: {
      provider: "browser",
      countdown_seconds: 3,
      capture_width: 1280,
      capture_height: 720,
      mirror_preview: false,
      screen_orientation: "landscape",
    },
    print: {
      enabled: false,
      mode: "browser",
      paper_size: "4x6",
      orientation: "auto",
      auto_print: false,
      margins_mm: 0,
      printer_name: "",
    },
    session: { timer_seconds: 60, warning_seconds: 10, max_retakes: null },
    appearance: {
      bg_color: "#000000",
      text_color: "#ffffff",
      font_scale: 1,
      button_radius: 0,
      padding: 16,
      welcome_title: "",
      welcome_tagline: "",
      guide_steps: "",
    },
  });

  for (const key of [
    "photo",
    "thermal",
    "receipt",
    "bluetooth_paper_width_mm",
    "bluetooth_device_name",
    "bridge_url",
  ]) {
    assert.equal(key in payload.print_settings, false, `${key} tidak boleh dikirim bila kosong`);
  }
  assert.equal("preferred_device_id" in payload.camera_settings, false);
});

test("output gif dibatasi 100–3000 ms dan 240–1080 px", () => {
  assert.equal(gifOutputSettingsSchema.safeParse({ frame_delay_ms: 50 }).success, false);
  assert.equal(gifOutputSettingsSchema.safeParse({ frame_delay_ms: 4000 }).success, false);
  assert.equal(gifOutputSettingsSchema.safeParse({ max_width: 100 }).success, false);
  assert.equal(gifOutputSettingsSchema.safeParse({ max_width: 2000 }).success, false);
  assert.equal(
    gifOutputSettingsSchema.safeParse({ enabled: true, frame_delay_ms: 800, max_width: 480 })
      .success,
    true
  );
});

test("business settings menerima output.gif", () => {
  const parsed = businessSettingsUpdateSchema.safeParse({
    output: { gif: { enabled: false, frame_delay_ms: 250, max_width: 640 } },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.output?.gif?.max_width, 640);
});
