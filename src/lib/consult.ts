/**
 * Konsultasi/pendaftaran via WhatsApp — nomor configurable.
 * Sumber: platform_settings key `consult_whatsapp` (bisa diubah admin),
 * fallback default di bawah. Halaman /register tidak membuka form;
 * diarahkan ke chat WhatsApp.
 */

export const CONSULT_WHATSAPP_DEFAULT = "08983704013";
export const CONSULT_SETTINGS_KEY = "consult_whatsapp";

export const WA_CONSULT_MESSAGE =
  "Halo SnapyOS, saya tertarik mendaftar & konsultasi bisnis photobox.";

/** "08983704013" / "+62 898…" / "628983704013" → "628983704013" (wa.me format). */
export function waNormalize(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export function waLink(number: string, message: string = WA_CONSULT_MESSAGE): string {
  return `https://wa.me/${waNormalize(number)}?text=${encodeURIComponent(message)}`;
}

/** Tampilan ramah untuk UI: 0898-3704-013. */
export function waDisplay(number: string): string {
  const d = number.replace(/\D/g, "");
  if (d.length === 11 || d.length === 12) {
    return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return number;
}
