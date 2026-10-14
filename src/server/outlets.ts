/**
 * Outlet CRUD + tenant isolation + plan limit — docs/04 §4.7, docs/08 §8.5.
 * Permission: OWNER, MANAGER (docs/04 §4.7).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can, type Permission } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { requirePlanLimits, isPlanLimitError } from "@/server/plan-limits";
import {
  outletCreateSchema,
  outletUpdateSchema,
  type OutletCreateInput,
  type OutletUpdateInput,
} from "@/lib/validators";
import {
  avgTransactionInteger,
  dateRangeSchema,
  rangeBoundariesTz,
} from "@/lib/dashboard-math";

export type OutletRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  status: string;
  created_at: string;
  photobox_count: number;
};

const OUTLET_COLUMNS = "id, name, address, city, province, status, created_at";

async function requireMembership(userId: string, businessId: string, permission: Permission) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, permission)) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin untuk aksi ini");
  }
  return membership;
}

export async function listOutlets(
  userId: string,
  businessId: string
): Promise<OutletRow[]> {
  await requireMembership(userId, businessId, "outlet:read");

  const supabase = createServerClient();
  const { data: outlets, error } = await supabase
    .from("outlets")
    .select(`${OUTLET_COLUMNS}, photoboxes ( count )`)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) throw new ApiError("INTERNAL", "Gagal memuat outlet");
  const rows = (outlets ?? []) as unknown as (Omit<OutletRow, "photobox_count"> & {
    photoboxes: { count: number } | { count: number }[] | null;
  })[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    province: row.province,
    status: row.status,
    created_at: row.created_at,
    photobox_count:
      row.photoboxes && !Array.isArray(row.photoboxes)
        ? Number(row.photoboxes.count ?? 0)
        : 0,
  }));
}

export async function createOutlet(
  userId: string,
  businessId: string,
  input: OutletCreateInput
) {
  const parsed = outletCreateSchema.parse(input);
  await requireMembership(userId, businessId, "outlet:write");

  const supabase = createServerClient();
  const limits = await requirePlanLimits(businessId);

  // Kuota + insert atomik (0069) — cegah race count-then-insert.
  const { data, error } = await supabase.rpc("create_outlet_with_quota", {
    p_business_id: businessId,
    p_max_outlets: limits.max_outlets,
    p_name: parsed.name,
    p_address: parsed.address ?? null,
    p_city: parsed.city ?? null,
    p_province: parsed.province ?? null,
    p_status: parsed.status ?? "active",
  });
  if (error) {
    if (isPlanLimitError(error)) {
      throw new ApiError(
        "PLAN_LIMIT_REACHED",
        `Plan Anda dibatasi ${limits.max_outlets} outlet. Upgrade untuk menambah.`
      );
    }
    throw new ApiError("INTERNAL", "Gagal membuat outlet");
  }
  return data;
}

export async function updateOutlet(
  userId: string,
  businessId: string,
  outletId: string,
  input: OutletUpdateInput
) {
  const parsed = outletUpdateSchema.parse(input);
  await requireMembership(userId, businessId, "outlet:write");

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("outlets")
    .update(parsed)
    .eq("id", outletId)
    .eq("business_id", businessId) // tenant scope — lintas tenant = 0 row → 404
    .select(OUTLET_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui outlet");
  if (!data) throw new ApiError("NOT_FOUND", "Outlet tidak ditemukan");
  return data;
}

export async function deleteOutlet(userId: string, businessId: string, outletId: string) {
  await requireMembership(userId, businessId, "outlet:write");

  const supabase = createServerClient();

  // Guard: outlet dengan photobox tidak bisa dihapus (docs/04 §4.7 validasi).
  const { count } = await supabase
    .from("photoboxes")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("outlet_id", outletId);
  if ((count ?? 0) > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Outlet masih memiliki photobox. Hapus photobox terlebih dahulu."
    );
  }

  const { error } = await supabase
    .from("outlets")
    .delete()
    .eq("id", outletId)
    .eq("business_id", businessId);
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus outlet");
}
