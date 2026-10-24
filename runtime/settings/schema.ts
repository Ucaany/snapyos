/**
 * Kontrak setelan device.
 *
 * Satu sumber kebenaran: schema di `src/lib/validators.ts`. Berkas ini hanya
 * menambahkan daftar siapa pemilik tiap field — aturan validasinya tidak
 * disalin, supaya runtime dan cloud tidak pernah berbeda pendapat.
 */

import { z } from "zod";
import {
  cameraSettingsSchema,
  printSettingsSchema,
  sessionSettingsSchema,
} from "../../src/lib/validators.ts";

/** Versi berkas export. Naikkan hanya bila bentuknya berubah. */
export const SETTINGS_SCHEMA_VERSION = 1;

export const DEVICE_GROUPS = ["camera_settings", "print_settings", "session_settings"] as const;
export type DeviceGroup = (typeof DEVICE_GROUPS)[number];

/** Field yang tetap milik cloud meski berada di dalam grup milik device. */
export const CLOUD_OWNED: Record<DeviceGroup, readonly string[]> = {
  camera_settings: [],
  // copies = biaya bahan, layout = bentuk output pelanggan.
  print_settings: ["copies", "layout"],
  session_settings: [],
};

/** Setelan device yang tersimpan: hanya grup milik device. */
export type SettingsShape = Partial<Record<DeviceGroup, Record<string, unknown>>>;

/**
 * Konfigurasi cloud boleh membawa field di luar grup device (`payment_mode`,
 * `status`, …). Field itu ikut terbawa apa adanya oleh `mergeSettings`.
 */
export type CloudSettings = SettingsShape & Record<string, unknown>;

export const deviceSettingsSchema = z
  .object({
    camera_settings: cameraSettingsSchema.optional(),
    print_settings: printSettingsSchema.optional(),
    session_settings: sessionSettingsSchema.optional(),
  })
  .strict();

export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;

const SHAPES: Record<DeviceGroup, Record<string, unknown>> = {
  camera_settings: cameraSettingsSchema.shape,
  print_settings: printSettingsSchema.shape,
  session_settings: sessionSettingsSchema.shape,
};

export function isDeviceGroup(key: string): key is DeviceGroup {
  return (DEVICE_GROUPS as readonly string[]).includes(key);
}

/** Nama field yang boleh ditulis device pada satu grup. */
export function deviceFields(group: DeviceGroup): string[] {
  return Object.keys(SHAPES[group]).filter((key) => !CLOUD_OWNED[group].includes(key));
}

/**
 * Field di payload yang BUKAN milik device. Kosong berarti payload boleh
 * ditulis; selain itu pemanggil menjawab 403 — bukan membuang diam-diam.
 */
export function foreignKeys(payload: Record<string, unknown>): string[] {
  const foreign: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (!isDeviceGroup(key)) {
      foreign.push(key);
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const allowed = deviceFields(key);
    for (const nested of Object.keys(value)) {
      if (!allowed.includes(nested)) foreign.push(`${key}.${nested}`);
    }
  }
  return foreign;
}
