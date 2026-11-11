/**
 * Anti-drift daftar adapter kamera.
 *
 * Daftar "jalur bridge" muncul di tiga tempat karena batas runtime berbeda:
 * - `src/lib/camera-provider.ts` (klien: memutuskan browser vs bridge)
 * - `src/lib/validators.ts`     (kontrak input setelan)
 * - `runtime/settings/index.ts` (runtime: adapter tersimpan vs env)
 *
 * Tes ini menegakkan ketiganya bergerak bersama. Tanpa ini, menambah adapter
 * baru akan lolos di satu tempat dan ditolak diam-diam di tempat lain.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { BRIDGE_PROVIDERS } from "../src/lib/camera-provider.ts";
import { cameraSettingsSchema } from "../src/lib/validators.ts";
import { STORED_BRIDGE_KINDS } from "../runtime/settings/index.ts";

test("daftar provider bridge klien = {bridge} ∪ adapter tersimpan runtime", () => {
  // "bridge" bukan adapter konkret (artinya "ikuti env"), jadi ia hanya ada di
  // daftar klien. Adapter konkretnya harus sama persis di kedua sisi.
  assert.deepEqual([...BRIDGE_PROVIDERS].sort(), ["bridge", ...STORED_BRIDGE_KINDS].sort());
});

test("kontrak input setelan menerima SEMUA adapter yang dikenal", () => {
  for (const provider of BRIDGE_PROVIDERS) {
    const parsed = cameraSettingsSchema.passthrough().safeParse({ provider });
    assert.equal(parsed.success, true, `provider "${provider}" ditolak validators`);
  }
  for (const provider of STORED_BRIDGE_KINDS) {
    const parsed = cameraSettingsSchema.passthrough().safeParse({ provider });
    assert.equal(parsed.success, true, `adapter "${provider}" tidak bisa dipilih dari setelan`);
  }
});

test("provider asing tetap ditolak", () => {
  const parsed = cameraSettingsSchema.passthrough().safeParse({ provider: "canon" });
  assert.equal(parsed.success, false);
});

test("semua adapter punya jalur di createCameraFor", async () => {
  const { createCameraFor } = await import("../runtime/camera/index.ts");
  const { loadConfig } = await import("../runtime/config.ts");
  const config = loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: "test-bridge-token-0123456789" });
  for (const kind of ["gphoto2", "libcamera", "v4l2", "pyav"] as const) {
    assert.equal(createCameraFor(config, kind, "stills").kind, kind);
  }
});
