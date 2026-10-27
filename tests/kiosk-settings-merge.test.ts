/**
 * Phase 4: kiosk memakai setelan device.
 *
 * Yang diuji hanya janji yang dipegang kiosk: field mesin menang, field uang
 * tetap milik cloud, runtime mati berarti cloud dipakai apa adanya.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeSettings } from "../src/lib/settings-merge.ts";

type Cloud = {
  status: string;
  payment_mode: string;
  camera_settings: Record<string, unknown>;
  print_settings: Record<string, unknown>;
  session_settings: Record<string, unknown>;
};

const cloud: Cloud = {
  status: "active",
  payment_mode: "qris",
  camera_settings: { provider: "browser", countdown_seconds: 3, mirror_preview: true },
  print_settings: { copies: 2, layout: "strip", paper_size: "4x6", enabled: true },
  session_settings: { timer_seconds: 60, max_retakes: 2 },
};

test("field device menang atas cloud", () => {
  const merged = mergeSettings(cloud, {
    camera_settings: { provider: "gphoto2", countdown_seconds: 5 },
    print_settings: { printer_name: "DNP DS620", paper_size: "A6" },
    session_settings: { timer_seconds: 90 },
  });

  assert.equal(merged.camera_settings.provider, "gphoto2");
  assert.equal(merged.camera_settings.countdown_seconds, 5);
  assert.equal(merged.print_settings.printer_name, "DNP DS620");
  assert.equal(merged.print_settings.paper_size, "A6");
  assert.equal(merged.session_settings.timer_seconds, 90);
});

test("cloud menang untuk copies dan layout", () => {
  const merged = mergeSettings(cloud, {
    print_settings: { copies: 9, layout: "single", printer_name: "DNP DS620" },
  });

  assert.equal(merged.print_settings.copies, 2);
  assert.equal(merged.print_settings.layout, "strip");
  assert.equal(merged.print_settings.printer_name, "DNP DS620");
});

test("runtime mati: cloud dipakai apa adanya", () => {
  assert.deepEqual(mergeSettings(cloud, null), cloud);
  assert.deepEqual(mergeSettings(cloud, undefined), cloud);
});

test("field cloud tidak terhapus oleh grup device", () => {
  const merged = mergeSettings(cloud, {
    print_settings: { paper_size: "A6" },
  });

  assert.equal(merged.status, "active");
  assert.equal(merged.payment_mode, "qris");
  assert.equal(merged.print_settings.enabled, true);
  assert.equal(merged.print_settings.copies, 2);
  assert.equal(merged.camera_settings.mirror_preview, true);
  assert.equal(merged.session_settings.max_retakes, 2);
});

test("field device bernilai undefined tidak menghapus nilai cloud", () => {
  const merged = mergeSettings(cloud, {
    camera_settings: { countdown_seconds: undefined },
  });

  assert.equal(merged.camera_settings.countdown_seconds, 3);
});

test("merge tidak mengubah objek cloud asli", () => {
  mergeSettings(cloud, { print_settings: { paper_size: "A6" } });
  assert.equal(cloud.print_settings.paper_size, "4x6");
});
