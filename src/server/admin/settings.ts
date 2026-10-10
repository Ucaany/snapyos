/**
 * Admin Platform Settings — docs/10 §10.4 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import {
  adminSettingsUpdateSchema,
  type AdminSettingsUpdateInput,
} from "@/lib/validators";
import { invalidateMaintenanceCache } from "@/lib/maintenance-cache";
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
  chroma_key_default_enabled?: boolean;
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
    chroma_key_default_enabled: undefined,
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
  const supabase = createServerClient();

  for (const [key, value] of Object.entries(parsed)) {
    const { error } = await supabase
      .from("platform_settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw new ApiError("INTERNAL", `Gagal menyimpan setting ${key}`);
  }
  // Default retention CEO diterapkan ke SEMUA tenant (mis. 7 → 3 hari) —
  // owner masih bisa override per business dari /dashboard/settings.
  if (parsed.default_retention_days !== undefined) {
    const { error } = await supabase
      .from("business_settings")
      .update({ retention_days: parsed.default_retention_days });
    if (error) {
      throw new ApiError("INTERNAL", "Default retention tersimpan tapi gagal diterapkan ke tenant");
    }
  }
  if (parsed.chroma_key_default_enabled !== undefined) {
    const { data: booths, error: boothError } = await supabase.from("photoboxes").select("id, camera_settings");
    if (boothError) throw new ApiError("INTERNAL", "Gagal menerapkan default chroma key ke photobox");
    for (const booth of booths ?? []) {
      await supabase.from("photoboxes").update({ camera_settings: { ...((booth.camera_settings as Record<string, unknown> | null) ?? {}), chroma_key_enabled: parsed.chroma_key_default_enabled } }).eq("id", booth.id);
    }
  }
  // Invalidate middleware cache agar toggle maintenance_mode langsung efektif.
  if (parsed.maintenance_mode !== undefined) {
    invalidateMaintenanceCache();
  }
  await audit(admin.id, "admin.settings.update", "platform_settings", { ...parsed });
  return getPlatformSettings();
}
