/**
 * Admin Add-ons — docs/10 §10.2 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { isMissingRelation } from "@/lib/supabase/errors";
import { ApiError } from "@/lib/api-errors";
import {
  adminAddOnCreateSchema,
  adminAddOnUpdateSchema,
  type AdminAddOnCreateInput,
  type AdminAddOnUpdateInput,
} from "@/lib/validators";
import { requireAdmin, audit } from "./guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminAddOnRow = {
  id: string;
  code: string;
  name: string;
  price_monthly: number;
  price_daily: number | null;
  price_weekly: number | null;
  price_yearly: number | null;
  unit: string;
  storage_mb: number | null;
  is_active: boolean;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listAddOns(): Promise<AdminAddOnRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("add_ons")
    .select(
      "id, code, name, price_monthly, price_daily, price_weekly, price_yearly, unit, storage_mb, is_active"
    )
    .order("created_at", { ascending: true });
  if (error && !isMissingRelation(error)) throw new ApiError("INTERNAL", "Gagal memuat add-ons");
  if (error) {
    // storage_mb/harga per siklus belum ada (0053/0093) → fallback kolom lama.
    const { data: base, error: baseError } = await supabase
      .from("add_ons")
      .select("id, code, name, price_monthly, unit, is_active")
      .order("created_at", { ascending: true });
    if (baseError) throw new ApiError("INTERNAL", "Gagal memuat add-ons");
    return ((base ?? []) as AdminAddOnRow[]).map((r) => ({
      ...r,
      price_daily: null,
      price_weekly: null,
      price_yearly: null,
      storage_mb: null,
    }));
  }
  return (data ?? []) as AdminAddOnRow[];
}

export async function createAddOn(input: AdminAddOnCreateInput): Promise<AdminAddOnRow> {
  const admin = await requireAdmin();
  const parsed = adminAddOnCreateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("add_ons")
    .insert(parsed)
    .select(
      "id, code, name, price_monthly, price_daily, price_weekly, price_yearly, unit, storage_mb, is_active"
    )
    .single();
  if (error) {
    if (error.code === "23505") throw new ApiError("VALIDATION_ERROR", "Kode add-on sudah dipakai");
    throw new ApiError("INTERNAL", "Gagal membuat add-on");
  }
  await audit(admin.id, "admin.add_on.create", data.id, { code: parsed.code });
  return data as AdminAddOnRow;
}

export async function updateAddOn(addOnId: string, input: AdminAddOnUpdateInput) {
  const admin = await requireAdmin();
  const parsed = adminAddOnUpdateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("add_ons")
    .update(parsed)
    .eq("id", addOnId)
    .select(
      "id, code, name, price_monthly, price_daily, price_weekly, price_yearly, unit, storage_mb, is_active"
    )
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui add-on");
  if (!data) throw new ApiError("NOT_FOUND", "Add-on tidak ditemukan");
  await audit(admin.id, "admin.add_on.update", addOnId, { ...parsed });
  return data as AdminAddOnRow;
}
