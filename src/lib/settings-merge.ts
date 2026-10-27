/**
 * Satu tempat aturan "siapa pemilik setelan" diterapkan di sisi kiosk.
 *
 * Yang berhubungan dengan uang milik cloud (harga, `copies`, `layout`,
 * `payment_mode`), yang berhubungan dengan mesin milik device (kamera, printer,
 * timer). Kiosk memanggil ini dengan hasil `GET /v1/settings`; runtime mati
 * berarti `device` null dan cloud dipakai apa adanya.
 */

export const DEVICE_GROUPS = ["camera_settings", "print_settings", "session_settings"] as const;
export type DeviceGroup = (typeof DEVICE_GROUPS)[number];

export type DeviceSettings = Partial<Record<DeviceGroup, Record<string, unknown>>>;

/** Field cloud yang berada di dalam grup milik device: pemilik menang. */
const CLOUD_OWNED: Record<DeviceGroup, readonly string[]> = {
  camera_settings: [],
  print_settings: ["copies", "layout"],
  session_settings: [],
};

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
    const base = out[group];
    const merged: Record<string, unknown> =
      base && typeof base === "object" && !Array.isArray(base)
        ? { ...(base as Record<string, unknown>) }
        : {};
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined || CLOUD_OWNED[group].includes(key)) continue;
      merged[key] = value;
    }
    out[group] = merged;
  }
  return out as T;
}
