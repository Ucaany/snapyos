/**
 * Feature entitlement per plan — docs/02 §2.7.
 * Pure (tanpa supabase) agar unit-testable — pola src/lib/*.
 * Membaca plans.features jsonb dan mengevaluasi apakah fitur aktif.
 *
 * Enforced feature keys: voucher, finance, reports, staff, direct_payment,
 * storage, cash_payment.
 * Fitur lain (custom_domain, white_label, event_mode, booking,
 * qr_delivery, custom_branding, advanced_templates, analytics_advanced)
 * ada di seed jsonb tetapi belum di-gate runtime — ditambahkan saat
 * fitur tersebut diimplementasi.
 */

/** Nama fitur yang di-gate server-side via requireFeature(). */
export type FeatureKey =
  | "voucher"
  | "finance"
  | "reports"
  | "staff"
  | "direct_payment"
  | "storage"
  | "cash_payment"
  | "pwa_kiosk";

/**
 * Evaluasi apakah fitur aktif berdasarkan plan features jsonb.
 * Default false jika key tidak ada — fail-closed.
 */
export function isFeatureEnabled(
  features: Record<string, boolean> | null | undefined,
  key: FeatureKey
): boolean {
  if (!features) return false;
  return features[key] === true;
}
