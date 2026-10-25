/**
 * Field photobox: mana yang boleh datang dari form dashboard.
 *
 * Form dashboard hanya menyimpan identitas dan kebijakan bisnis. Setelan mesin
 * (kamera, printer, sesi) ditulis aplikasi booth lewat device token; `exit_pin`
 * tetap milik cloud tapi tidak punya editor di dashboard lagi. Semuanya ditolak
 * bila dikirim dari sesi pengguna, bukan dibuang diam-diam.
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
  "chroma_key_enabled",
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
  "exit_pin",
] as const;

const FORBIDDEN = new Set<string>(DASHBOARD_FORBIDDEN_PHOTOBOX_FIELDS);

/** Kunci form yang bukan milik dashboard. Urutan mengikuti kunci masuk. */
export function forbiddenPhotoboxFields(keys: Iterable<string>): string[] {
  return [...keys].filter((key) => FORBIDDEN.has(key));
}
