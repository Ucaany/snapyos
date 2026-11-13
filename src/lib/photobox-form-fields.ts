/**
 * Field photobox: mana yang boleh datang dari form dashboard.
 *
 * Form dashboard hanya menyimpan identitas, kebijakan bisnis, dan PIN keluar
 * kiosk (write-only, di-hash server). Setelan mesin (kamera, printer, sesi)
 * ditulis aplikasi booth lewat device token; field mesin tetap ditolak bila
 * dikirim dari sesi pengguna, bukan dibuang diam-diam.
 */

/** Satu-satunya field yang boleh datang dari form dashboard. */
export const CLOUD_PHOTOBOX_FIELDS = [
  "name",
  "slug",
  "outlet_id",
  "status",
  "payment_mode",
  "copies",
  "print_layout",
] as const;

/** Kunci form yang tidak boleh ditulis dari sesi pengguna. */
export const DASHBOARD_FORBIDDEN_PHOTOBOX_FIELDS = [
  "camera_provider",
  "camera_bridge_url",
  "facing_mode",
  "capture_width",
  "capture_height",
  "jpeg_quality",
  "mirror_preview",
  "fullscreen",
  "rotation_degrees",
  "zoom",
  "screen_orientation",
  "countdown_seconds",
  "timer_seconds",
  "warning_seconds",
  "max_retakes",
  "unlimited_retakes",
  "print_enabled",
  "auto_print",
  "print_mode",
  "printer_name",
  "print_bridge_url",
  "paper_size",
  "orientation",
  "margins_mm",
  "bluetooth_paper_width_mm",
  "bluetooth_device_name",
] as const;

const FORBIDDEN = new Set<string>(DASHBOARD_FORBIDDEN_PHOTOBOX_FIELDS);

/** Kunci form yang bukan milik dashboard. Urutan mengikuti kunci masuk. */
export function forbiddenPhotoboxFields(keys: Iterable<string>): string[] {
  return [...keys].filter((key) => FORBIDDEN.has(key));
}
