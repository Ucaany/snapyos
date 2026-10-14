/**
 * Voucher CRUD + analytics — docs/04 §4.11, docs/08 §8.8.
 * Code unik per business (uppercase); discount tercatat terpisah dari revenue.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can, type Permission } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import {
  voucherCreateSchema,
  voucherUpdateSchema,
  voucherInvariantError,
  type VoucherCreateInput,
  type VoucherUpdateInput,
} from "@/lib/validators";
import { requireFeature } from "@/server/feature-gate";

const COLUMNS = `id, code, type, amount, start_date, end_date, usage_limit,
  usage_per_customer, min_transaction, max_discount, is_active, created_at,
  voucher_usages ( count ),
  voucher_packages ( package_id ),
  voucher_outlets ( outlet_id )`;

type CountJoin = { count: number } | { count: number }[] | null;
type PackageJoin = { package_id: string }[] | null;
type OutletJoin = { outlet_id: string }[] | null;

export type VoucherRow = {
  id: string;
  code: string;
  type: string;
  amount: number;
  start_date: string | null;
  end_date: string | null;
  usage_limit: number | null;
  usage_per_customer: number;
  min_transaction: number;
  max_discount: number | null;
  is_active: boolean;
  created_at: string;
  usage: number;
  status: "active" | "scheduled" | "expired" | "inactive";
  package_ids: string[];
  outlet_ids: string[];
};

function deriveStatus(row: {
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}): VoucherRow["status"] {
  const now = Date.now();
  if (!row.is_active) return "inactive";
  if (row.start_date && Date.parse(row.start_date) > now) return "scheduled";
  if (row.end_date && Date.parse(row.end_date) < now) return "expired";
  return "active";
}

async function requireMembership(userId: string, businessId: string, permission: Permission) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, permission)) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin untuk aksi ini");
  }
  return membership;
}

async function assertIdsOwned(
  businessId: string,
  table: "packages" | "outlets",
  ids: string[]
) {
  if (ids.length === 0) return;
  const supabase = createServerClient();
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("business_id", businessId)
    .in("id", ids);
  const found = new Set((data ?? []).map((r) => r.id));
  if (ids.some((id) => !found.has(id))) {
    throw new ApiError("VALIDATION_ERROR", `Ada ${table} yang bukan milik business ini`);
  }
}

async function syncM2M(
  voucherId: string,
  table: "voucher_packages" | "voucher_outlets",
  column: "package_id" | "outlet_id",
  ids: string[]
) {
  const supabase = createServerClient();
  const del = await supabase.from(table).delete().eq("voucher_id", voucherId);
  if (del.error) throw new ApiError("INTERNAL", "Gagal sinkronisasi assignment");
  if (ids.length > 0) {
    const ins = await supabase
      .from(table)
      .insert(ids.map((id) => ({ voucher_id: voucherId, [column]: id })));
    if (ins.error) throw new ApiError("INTERNAL", "Gagal sinkronisasi assignment");
  }
}

function mapRow(row: {
  id: string; code: string; type: string; amount: number;
  start_date: string | null; end_date: string | null; usage_limit: number | null;
  usage_per_customer: number; min_transaction: number; max_discount: number | null;
  is_active: boolean; created_at: string; voucher_usages?: CountJoin;
  voucher_packages?: PackageJoin;
  voucher_outlets?: OutletJoin;
}): VoucherRow {
  const usageCount = Array.isArray(row.voucher_usages)
    ? row.voucher_usages.reduce((sum, item) => sum + Number(item.count ?? 0), 0)
    : row.voucher_usages
      ? Number(row.voucher_usages.count ?? 0)
      : 0;
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    amount: row.amount,
    start_date: row.start_date,
    end_date: row.end_date,
    usage_limit: row.usage_limit,
    usage_per_customer: row.usage_per_customer,
    min_transaction: row.min_transaction,
    max_discount: row.max_discount,
    is_active: row.is_active,
    created_at: row.created_at,
    usage: usageCount,
    status: deriveStatus(row),
    package_ids: (row.voucher_packages ?? []).map((entry) => entry.package_id),
    outlet_ids: (row.voucher_outlets ?? []).map((entry) => entry.outlet_id),
  };
}

export async function listVouchers(userId: string, businessId: string): Promise<VoucherRow[]> {
  await requireFeature(businessId, "voucher");
  await requireMembership(userId, businessId, "voucher:read");
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("vouchers")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat vouchers");
  return (data ?? []).map((row) => mapRow(row as Parameters<typeof mapRow>[0]));
}

export async function createVoucher(
  userId: string,
  businessId: string,
  input: VoucherCreateInput
) {
  const parsed = voucherCreateSchema.parse(input);
  await requireFeature(businessId, "voucher");
  await requireMembership(userId, businessId, "voucher:write");
  await Promise.all([
    assertIdsOwned(businessId, "packages", parsed.package_ids),
    assertIdsOwned(businessId, "outlets", parsed.outlet_ids),
  ]);

  const supabase = createServerClient();
  const { data: dupe } = await supabase
    .from("vouchers")
    .select("id")
    .eq("business_id", businessId)
    .eq("code", parsed.code)
    .maybeSingle();
  if (dupe) {
    throw new ApiError("VALIDATION_ERROR", "Kode sudah dipakai voucher lain di business ini", {
      code: ["Kode sudah dipakai"],
    });
  }

  const { package_ids, outlet_ids, ...fields } = parsed;
  const { data, error } = await supabase
    .from("vouchers")
    .insert({ business_id: businessId, ...fields })
    .select("id, code, type, amount")
    .single();
  if (error) throw new ApiError("INTERNAL", "Gagal membuat voucher");

  await Promise.all([
    syncM2M(data.id, "voucher_packages", "package_id", package_ids),
    syncM2M(data.id, "voucher_outlets", "outlet_id", outlet_ids),
  ]);
  return data;
}

export async function updateVoucher(
  userId: string,
  businessId: string,
  voucherId: string,
  input: VoucherUpdateInput
) {
  const parsed = voucherUpdateSchema.parse(input);
  await requireFeature(businessId, "voucher");
  await requireMembership(userId, businessId, "voucher:write");

  // Invariant terhadap row tersimpan: patch parsial tidak boleh menghasilkan
  // persentase > 100 hanya karena `type` tidak ikut dikirim.
  const { data: current, error: currentError } = await createServerClient()
    .from("vouchers")
    .select("type, amount, start_date, end_date, min_transaction, max_discount")
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (currentError) throw new ApiError("INTERNAL", "Gagal memuat voucher");
  if (!current) throw new ApiError("NOT_FOUND", "Voucher tidak ditemukan");
  const invariantIssues = voucherInvariantError(
    current as {
      type: string;
      amount: number;
      start_date: string | null;
      end_date: string | null;
      min_transaction: number;
      max_discount: number | null;
    },
    parsed
  );
  if (invariantIssues.length > 0) {
    const issue = invariantIssues[0]!;
    throw new ApiError("VALIDATION_ERROR", issue.message, {
      [issue.path[0] ?? "amount"]: [issue.message],
    });
  }

  if (parsed.code) {
    const supabase0 = createServerClient();
    const { data: dupe } = await supabase0
      .from("vouchers")
      .select("id")
      .eq("business_id", businessId)
      .eq("code", parsed.code)
      .neq("id", voucherId)
      .maybeSingle();
    if (dupe) {
      throw new ApiError("VALIDATION_ERROR", "Kode sudah dipakai voucher lain di business ini", {
        code: ["Kode sudah dipakai"],
      });
    }
  }
  if (parsed.package_ids) await assertIdsOwned(businessId, "packages", parsed.package_ids);
  if (parsed.outlet_ids) await assertIdsOwned(businessId, "outlets", parsed.outlet_ids);

  const supabase = createServerClient();
  const { package_ids, outlet_ids, ...fields } = parsed;
  const { data, error } = await supabase
    .from("vouchers")
    .update(fields)
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .select("id, code, type, amount")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui voucher");
  if (!data) throw new ApiError("NOT_FOUND", "Voucher tidak ditemukan");

  if (package_ids) await syncM2M(voucherId, "voucher_packages", "package_id", package_ids);
  if (outlet_ids) await syncM2M(voucherId, "voucher_outlets", "outlet_id", outlet_ids);
  return data;
}

export async function deleteVoucher(
  userId: string,
  businessId: string,
  voucherId: string
) {
  await requireFeature(businessId, "voucher");
  await requireMembership(userId, businessId, "voucher:write");
  const supabase = createServerClient();

  // Guard: voucher yang sudah terpakai tidak dihapus (FK restrict di usages).
  const { count } = await supabase
    .from("voucher_usages")
    .select("id", { count: "exact", head: true })
    .eq("voucher_id", voucherId);
  if ((count ?? 0) > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Voucher sudah terpakai — nonaktifkan saja (Switch active)."
    );
  }

  const { data, error } = await supabase
    .from("vouchers")
    .delete()
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus voucher");
  if (!data) throw new ApiError("NOT_FOUND", "Voucher tidak ditemukan");
}

export type VoucherAnalytics = {
  voucherId: string;
  code: string;
  totalUsage: number;
  totalDiscount: number;
  revenueGenerated: number;
};

export async function getVoucherAnalyticsBatch(
  userId: string,
  businessId: string,
  voucherIds: string[]
): Promise<Record<string, { totalDiscount: number; revenueGenerated: number }>> {
  await requireFeature(businessId, "voucher");
  await requireMembership(userId, businessId, "voucher:read");
  if (voucherIds.length === 0) return {};
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("voucher_usages")
    .select("voucher_id, discount_amount, transactions ( final_amount, status )")
    .eq("business_id", businessId)
    .in("voucher_id", voucherIds);
  if (error) throw new ApiError("INTERNAL", "Gagal memuat analytics voucher");

  const result: Record<string, { totalDiscount: number; revenueGenerated: number }> = {};
  for (const id of voucherIds) result[id] = { totalDiscount: 0, revenueGenerated: 0 };
  for (const row of (data ?? []) as {
    voucher_id: string;
    discount_amount: number;
    transactions: { final_amount: number; status: string } | { final_amount: number; status: string }[] | null;
  }[]) {
    const item = result[row.voucher_id];
    if (!item) continue;
    item.totalDiscount += row.discount_amount;
    const tx = row.transactions && !Array.isArray(row.transactions) ? row.transactions : null;
    if (tx?.status === "paid") item.revenueGenerated += tx.final_amount;
  }
  return result;
}

