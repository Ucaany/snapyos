/**
 * Satu tempat aturan "siapa pemilik setelan" diterapkan di sisi kiosk.
 *
 * Yang berhubungan dengan uang milik cloud (harga, `copies`, `layout`,
 * `payment_mode`), yang berhubungan dengan mesin milik device (kamera, printer,
 * timer). Kiosk memanggil ini dengan hasil `GET /v1/settings`; runtime mati
 * berarti `device` null dan cloud dipakai apa adanya.
 *
 * Aturan kepemilikan TIDAK ditulis ulang di sini: `mergeDeviceGroup` di
 * `device-settings-contract.ts` adalah satu-satunya implementasi, dipakai juga
 * oleh `mergeDeviceSettings` server (`src/lib/validators.ts`).
 */

import {
  DEVICE_SETTING_GROUPS,
  mergeDeviceGroup,
  type DeviceSettingGroupName,
} from "./device-settings-contract.ts";

/**
 * Grup setelan yang hidup di mesin booth.
 *
 * `appearance_settings` ikut di sini karena kustomisasi tampilan disimpan
 * bersama setelan mesin lain di store lokal runtime (`PUT /v1/settings`) dan
 * menang atas branding cloud. Grup ini TIDAK ikut naik ke cloud — lihat
 * `LOCAL_ONLY_DEVICE_GROUPS` di `src/lib/validators.ts`.
 */
export const DEVICE_GROUPS = DEVICE_SETTING_GROUPS;
export type DeviceGroup = DeviceSettingGroupName;

export type DeviceSettings = Partial<Record<DeviceGroup, Record<string, unknown>>>;

/**
 * Salin field device di atas cloud. Grup yang tidak dilaporkan device, dan
 * field yang bukan milik device, tetap persis seperti yang dikirim cloud.
 */
export function mergeSettings<T extends object>(
  cloud: T,
  device: DeviceSettings | null | undefined
): T {
  if (!device) return cloud;
  const out = { ...cloud } as Record<string, unknown>;
  for (const group of DEVICE_GROUPS) {
    const incoming = device[group];
    if (!incoming) continue;
    out[group] = mergeDeviceGroup(group, out[group], incoming);
  }
  return out as T;
}
