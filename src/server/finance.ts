/**
 * Finance — income vs expense → estimated profit (docs/04 §4.4, docs/08 §8.9).
 * Income dari transactions (paid); expenses CRUD manual (10 kategori).
 * Uang integer IDR; margin basis-point integer.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { insertAudit } from "@/server/audit";
import { resolveRange } from "@/server/dashboard";
import {
  marginBp,
  profitInteger,
  rangeBoundariesTz,
  type DateRangeInput,
} from "@/lib/dashboard-math";
import {
  expenseCreateSchema,
  expenseUpdateSchema,
  type ExpenseCreateInput,
  type ExpenseUpdateInput,
} from "@/lib/validators";
import { requireFeature } from "@/server/feature-gate";

const EXPENSE_COLUMNS = "id, category, amount, note, expense_date, outlet_id, created_at";

async function requireFinance(userId: string, businessId: string, write = false) {
  await requireFeature(businessId, "finance");
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, write ? "expense:write" : "finance:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses finance");
  }
  return membership;
}

export type ExpenseRow = {
  id: string;
  category: string;
  amount: number;
  note: string | null;
  expense_date: string;
  outlet_id: string | null;
  created_at: string;
};

export type FinanceSummary = {
  range: { from: string; to: string };
  gross: number;
  discount: number;
  net: number;
  expenses: number;
  expensesByCategory: { category: string; amount: number }[];
  profit: number;
  marginBp: number;
};

export async function getFinanceSummary(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<FinanceSummary> {
  await requireFeature(businessId, "finance");
  const { range, role } = await resolveRange(userId, businessId, query);
  if (!can(role as "owner" | "manager" | "staff", "finance:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses finance");
  }
  const { startMs, endMs } = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const fromIso = new Date(startMs).toISOString();
  const toIso = new Date(endMs).toISOString();

  const supabase = createServerClient();
  const [tx, expenseRows] = await Promise.all([
    supabase.rpc("dashboard_tx_summary", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase.rpc("finance_expense_summary", {
      p_business: businessId,
      p_from: range.from,
      p_to: range.to,
    }),
  ]);
  if (tx.error || expenseRows.error) throw new ApiError("INTERNAL", "Gagal memuat finance");

  const sum = ((tx.data ?? []) as { gross: number; discount: number; net: number }[])[0];
  const gross = Number(sum?.gross ?? 0);
  const discount = Number(sum?.discount ?? 0);
  const net = Number(sum?.net ?? 0);

  const expensesByCategory = (
    (expenseRows.data ?? []) as { category: string; amount: number }[]
  )
    .map((r) => ({ category: r.category, amount: Number(r.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount);
  const expenses = expensesByCategory.reduce((s, r) => s + r.amount, 0);

  const profit = profitInteger(net, expenses);
  return {
    range: { from: range.from, to: range.to },
    gross,
    discount,
    net,
    expenses,
    expensesByCategory,
    profit,
    marginBp: marginBp(profit, net),
  };
}

async function canReadExpenses(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  return membership ? can(membership.role, "expense:read") : false;
}

async function assertOutletOwned(businessId: string, outletId: string | null | undefined) {
  if (!outletId) return;
  const supabase = createServerClient();
  const { data } = await supabase
    .from("outlets")
    .select("id")
    .eq("id", outletId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) throw new ApiError("VALIDATION_ERROR", "Outlet tidak ditemukan di business ini");
}

export async function listExpenses(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<ExpenseRow[]> {
  await requireFinance(userId, businessId, false);
  if (!(await canReadExpenses(userId, businessId))) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses expenses");
  }
  const { range } = await resolveRange(userId, businessId, query);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("business_id", businessId)
    .gte("expense_date", range.from)
    .lte("expense_date", range.to)
    .order("expense_date", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat expenses");
  return (data ?? []) as ExpenseRow[];
}

export async function createExpense(
  userId: string,
  businessId: string,
  input: ExpenseCreateInput
) {
  const parsed = expenseCreateSchema.parse(input);
  await requireFinance(userId, businessId, true);
  await assertOutletOwned(businessId, parsed.outlet_id);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({ business_id: businessId, ...parsed })
    .select(EXPENSE_COLUMNS)
    .single();
  if (error) throw new ApiError("INTERNAL", "Gagal membuat expense");
  await insertAudit({
    actorId: userId,
    businessId,
    action: "expense.create",
    target: data.id,
    meta: { category: data.category, amount: data.amount },
  });
  return data;
}

export async function updateExpense(
  userId: string,
  businessId: string,
  expenseId: string,
  input: ExpenseUpdateInput
) {
  const parsed = expenseUpdateSchema.parse(input);
  await requireFinance(userId, businessId, true);
  await assertOutletOwned(businessId, parsed.outlet_id);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .update(parsed)
    .eq("id", expenseId)
    .eq("business_id", businessId)
    .select(EXPENSE_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui expense");
  if (!data) throw new ApiError("NOT_FOUND", "Expense tidak ditemukan");
  await insertAudit({
    actorId: userId,
    businessId,
    action: "expense.update",
    target: expenseId,
    meta: { category: data.category, amount: data.amount },
  });
  return data;
}

export async function deleteExpense(userId: string, businessId: string, expenseId: string) {
  await requireFinance(userId, businessId, true);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus expense");
  if (!data) throw new ApiError("NOT_FOUND", "Expense tidak ditemukan");
  await insertAudit({
    actorId: userId,
    businessId,
    action: "expense.delete",
    target: expenseId,
    meta: {},
  });
}
