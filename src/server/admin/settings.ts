/**
 * Admin Platform Settings — docs/10 §10.4 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { adminSettingsUpdateSchema, type AdminSettingsUpdateInput } from "@/lib/validators";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS, DEFAULT_RETENTION_DAYS } from "@/lib/retention";
import { requireAdmin, audit } from "./guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlatformSettings = {
  platform_fee_percent?: number;
  platform_fee_flat?: number;
  default_retention_days?: number;
  trial_days?: number;
  maintenance_mode?: boolean;
  maintenance_message?: string;
  gateway_pakasir_enabled?: boolean;
  gateway_midtrans_enabled?: boolean;
  gateway_tripay_enabled?: boolean;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getPlatformSettings(): Promise<PlatformSettings> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase.from("platform_settings").select("key, value");
  if (error) throw new ApiError("INTERNAL", "Gagal memuat platform settings");
  const out: PlatformSettings = {
    platform_fee_percent: undefined,
    platform_fee_flat: undefined,
    default_retention_days: undefined,
    trial_days: undefined,
    maintenance_mode: undefined,
    maintenance_message: undefined,
    gateway_pakasir_enabled: undefined,
    gateway_midtrans_enabled: undefined,
    gateway_tripay_enabled: undefined,
  };
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    if (row.key in out) (out as Record<string, unknown>)[row.key] = row.value;
  }
  return out;
}

export async function updatePlatformSettings(input: AdminSettingsUpdateInput) {
  const admin = await requireAdmin();
  const parsed = adminSettingsUpdateSchema.parse(input);

  // Guard di titik tulis lintas-tenant, SEBELUM upsert apa pun: nilai default
  // retention di luar rentang privasi 1–3 ditolak (VALIDATION_ERROR), TIDAK
  // di-clamp diam-diam. Schema sudah membatasinya; cek ini menjaga bila kelak
  // ada pemanggil yang melewati schema, dan menolak lebih awal agar tidak ada
  // tulisan parsial ke platform_settings.
  if (
    parsed.default_retention_days !== undefined &&
    (parsed.default_retention_days < RETENTION_MIN_DAYS ||
      parsed.default_retention_days > RETENTION_MAX_DAYS)
  ) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Default retention harus ${RETENTION_MIN_DAYS}–${RETENTION_MAX_DAYS} hari`,
      { default_retention_days: parsed.default_retention_days }
    );
  }

  const supabase = createServerClient();

  // A-024: baca default lama SEBELUM upsert. Default baru hanya diterapkan ke
  // tenant yang masih memakai default lama, sehingga override owner tidak
  // tertimpa diam-diam.
  let previousRetention: number = DEFAULT_RETENTION_DAYS;
  if (parsed.default_retention_days !== undefined) {
    const { data: prev } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "default_retention_days")
      .maybeSingle();
    const raw = (prev as { value?: unknown } | null)?.value;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isInteger(n) && n > 0) previousRetention = n;
  }

  for (const [key, value] of Object.entries(parsed)) {
    // zod 4 mempertahankan key yang eksplisit `undefined`; skip agar tidak
    // upsert value null ke kolom jsonb NOT NULL (form parsial, mis. gateway saja).
    if (value === undefined) continue;
    const { error } = await supabase
      .from("platform_settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw new ApiError("INTERNAL", `Gagal menyimpan setting ${key}`);
  }
  // Default retention CEO diterapkan ke tenant yang BELUM override (masih
  // memakai default lama). Owner tetap bisa override per business.
  if (parsed.default_retention_days !== undefined) {
    const { error } = await supabase
      .from("business_settings")
      .update({ retention_days: parsed.default_retention_days })
      .eq("retention_days", previousRetention);
    if (error) {
      throw new ApiError("INTERNAL", "Default retention tersimpan tapi gagal diterapkan ke tenant");
    }
  }
  await audit(admin.id, "admin.settings.update", "platform_settings", { ...parsed });
  return getPlatformSettings();
}
