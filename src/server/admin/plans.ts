/**
 * Admin Plans — docs/10 §10.2 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import {
  adminPlanCreateSchema,
  adminPlanUpdateSchema,
  type AdminPlanCreateInput,
  type AdminPlanUpdateInput,
} from "@/lib/validators";
import { requireAdmin, audit } from "./guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminPlanRow = {
  id: string;
  code: string;
  name: string;
  price_monthly: number;
  max_businesses: number;
  max_outlets: number;
  max_photoboxes: number;
  max_concurrent_sessions: number;
  max_staff: number;
  storage_limit_mb: number;
  platform_fee_percent: number;
  platform_fee_flat: number;
  features: Record<string, boolean>;
  is_active: boolean;
};

const PLAN_COLUMNS =
  "id, code, name, price_monthly, max_businesses, max_outlets, max_photoboxes, max_concurrent_sessions, max_staff, storage_limit_mb, platform_fee_percent, platform_fee_flat, features, is_active";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listPlans(): Promise<AdminPlanRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("plans")
    .select(PLAN_COLUMNS)
    .order("price_monthly", { ascending: true });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat plans");
  return (data ?? []) as AdminPlanRow[];
}

export async function createPlan(input: AdminPlanCreateInput): Promise<AdminPlanRow> {
  const admin = await requireAdmin();
  const parsed = adminPlanCreateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("plans")
    .insert({ ...parsed })
    .select(PLAN_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new ApiError("VALIDATION_ERROR", "Kode plan sudah dipakai");
    throw new ApiError("INTERNAL", "Gagal membuat plan");
  }
  await audit(admin.id, "admin.plan.create", data.id, { code: parsed.code });
  return data as AdminPlanRow;
}

export async function updatePlan(planId: string, input: AdminPlanUpdateInput) {
  const admin = await requireAdmin();
  const parsed = adminPlanUpdateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("plans")
    .update(parsed)
    .eq("id", planId)
    .select(PLAN_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui plan");
  if (!data) throw new ApiError("NOT_FOUND", "Plan tidak ditemukan");
  await audit(admin.id, "admin.plan.update", planId, { ...parsed });
  return data as AdminPlanRow;
}
