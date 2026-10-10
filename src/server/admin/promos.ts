/**
 * Admin Subscription Promos — docs/10 §10.2, migration 0014.
 * Manage subscription-level discount codes (persentase/fixed) untuk billing plan.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { requireAdmin, audit } from "./guard";
import {
  adminPromoCreateSchema,
  adminPromoUpdateSchema,
  type AdminPromoCreateInput,
  type AdminPromoUpdateInput,
} from "@/lib/validators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminPromoRow = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  amount: number;
  min_transaction: number;
  max_discount: number | null;
  start_date: string | null;
  end_date: string | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  created_at: string;
};

const PROMO_COLUMNS =
  "id, code, type, amount, min_transaction, max_discount, start_date, end_date, usage_limit, used_count, is_active, created_at";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listPromos(): Promise<AdminPromoRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("subscription_promos")
    .select(PROMO_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat promo");
  return (data ?? []) as AdminPromoRow[];
}

export async function createPromo(input: AdminPromoCreateInput): Promise<AdminPromoRow> {
  const admin = await requireAdmin();
  const parsed = adminPromoCreateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("subscription_promos")
    .insert({
      code: parsed.code,
      type: parsed.type,
      amount: parsed.amount,
      min_transaction: parsed.min_transaction ?? 0,
      max_discount: parsed.max_discount ?? null,
      start_date: parsed.start_date ?? null,
      end_date: parsed.end_date ?? null,
      usage_limit: parsed.usage_limit ?? null,
      is_active: parsed.is_active ?? true,
    })
    .select(PROMO_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ApiError("VALIDATION_ERROR", "Kode promo sudah dipakai");
    }
    throw new ApiError("INTERNAL", "Gagal membuat promo");
  }
  await audit(admin.id, "admin.promo.create", data.id, { code: parsed.code });
  return data as AdminPromoRow;
}

export async function updatePromo(
  promoId: string,
  input: AdminPromoUpdateInput
): Promise<AdminPromoRow> {
  const admin = await requireAdmin();
  const parsed = adminPromoUpdateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("subscription_promos")
    .update(parsed)
    .eq("id", promoId)
    .select(PROMO_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      throw new ApiError("VALIDATION_ERROR", "Kode promo sudah dipakai");
    }
    throw new ApiError("INTERNAL", "Gagal memperbarui promo");
  }
  if (!data) throw new ApiError("NOT_FOUND", "Promo tidak ditemukan");
  await audit(admin.id, "admin.promo.update", promoId, parsed);
  return data as AdminPromoRow;
}
