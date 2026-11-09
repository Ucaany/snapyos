/**
 * Kontrak setelan device.
 *
 * Satu sumber kebenaran: kontrak device + tabel kepemilikan di
 * `src/lib/validators.ts`, dipakai bersama cloud dan runtime. Berkas ini hanya
 * menamai ulang untuk sisi runtime.
 */

import {
  CLOUD_OWNED_SETTING_FIELDS,
  DEVICE_SETTING_GROUPS,
  deviceSettingFields,
  deviceSettingsSchema,
  foreignSettingKeys,
  type DeviceSettingGroup,
} from "../../src/lib/validators.ts";

/** Versi berkas export. Naikkan hanya bila bentuknya berubah. */
export { SETTINGS_SCHEMA_VERSION } from "../../src/lib/device-settings-contract.ts";

export const DEVICE_GROUPS = DEVICE_SETTING_GROUPS;
export type DeviceGroup = DeviceSettingGroup;

/** Field yang tetap milik cloud meski berada di dalam grup milik device. */
export const CLOUD_OWNED = CLOUD_OWNED_SETTING_FIELDS;

/** Setelan device yang tersimpan: hanya grup milik device. */
export type SettingsShape = Partial<Record<DeviceGroup, Record<string, unknown>>>;

/**
 * Konfigurasi cloud boleh membawa field di luar grup device (`payment_mode`,
 * `status`, …). Field itu ikut terbawa apa adanya oleh `mergeSettings`.
 */
export type CloudSettings = SettingsShape & Record<string, unknown>;

export {
  deviceSettingFields as deviceFields,
  deviceSettingsSchema,
  foreignSettingKeys as foreignKeys,
};
