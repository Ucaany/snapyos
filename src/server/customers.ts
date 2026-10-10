/**
 * Customer management — docs/04 §4.12, docs/08 §8.10.
 * Data minimal (tanpa pengumpulan berlebihan); spending dari transactions paid.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { listQuerySchema } from "@/lib/validators";

async function requireMembership(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "customer:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses data customer");
  }
  return membership;
}

export type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  totalSpending: number;
  transactionCount: number;
  lastActive: string | null;
};

export type CustomerListInput = { q?: string; page?: number; limit?: number };

export async function listCustomers(
  userId: string,
  businessId: string,
  query: CustomerListInput
): Promise<{ rows: CustomerRow[]; page: number; limit: number; total: number }> {
  await requireMembership(userId, businessId);
  const parsed = listQuerySchema.parse(query);

  const supabase = createServerClient();
  let req = supabase
    .from("customers")
    .select("id, name, phone, email, created_at", { count: "exact" })
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .range((parsed.page - 1) * parsed.limit, parsed.page * parsed.limit - 1);
  if (parsed.q) {
    const like = `%${parsed.q.replace(/[%_]/g, (m) => "\\" + m)}%`;
    req = req.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
  }
  const { data, count, error } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat customers");

  const ids = (data ?? []).map((c) => c.id);
  const spendingMap = new Map<string, { total: number; count: number; last: string | null }>();
  if (ids.length > 0) {
    // Agregasi via RPC (migrasi 0037) — tanpa transfer baris tx per customer.
    const { data: agg, error: aggError } = await supabase.rpc("customer_spending", {
      p_business: businessId,
      p_customer_ids: ids,
    });
    if (aggError) throw new ApiError("INTERNAL", "Gagal memuat spending customer");
    for (const row of (agg ?? []) as {
      customer_id: string;
      total_spending: number | string;
      tx_count: number | string;
      last_active: string | null;
    }[]) {
      spendingMap.set(row.customer_id, {
        total: Number(row.total_spending ?? 0),
        count: Number(row.tx_count ?? 0),
        last: row.last_active,
      });
    }
  }

  const rows: CustomerRow[] = (data ?? []).map((c) => {
    const s = spendingMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      created_at: c.created_at,
      totalSpending: s?.total ?? 0,
      transactionCount: s?.count ?? 0,
      lastActive: s?.last ?? null,
    };
  });
  return { rows, page: parsed.page, limit: parsed.limit, total: count ?? 0 };
}

export type CustomerDetail = CustomerRow & {
  transactions: {
    id: string;
    number: string;
    finalAmount: number;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }[];
  sessions: {
    id: string;
    status: string;
    createdAt: string;
    photobox: string | null;
  }[];
};

export async function getCustomer(
  userId: string,
  businessId: string,
  customerId: string
): Promise<CustomerDetail> {
  await requireMembership(userId, businessId);
  const supabase = createServerClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, created_at")
    .eq("id", customerId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat customer");
  if (!customer) throw new ApiError("NOT_FOUND", "Customer tidak ditemukan");

  const [tx, sessions] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, number, final_amount, status, paid_at, created_at")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("sessions")
      .select("id, status, created_at, photoboxes ( name )")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (tx.error || sessions.error) throw new ApiError("INTERNAL", "Gagal memuat riwayat customer");

  const paid = ((tx.data ?? []) as { final_amount: number; status: string; paid_at: string | null }[])
    .filter((r) => r.status === "paid");
  const totalSpending = paid.reduce((s, r) => s + r.final_amount, 0);
  const lastActive =
    paid
      .map((r) => r.paid_at)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    created_at: customer.created_at,
    totalSpending,
    transactionCount: tx.data?.length ?? 0,
    lastActive,
    transactions: ((tx.data ?? []) as {
      id: string; number: string; final_amount: number; status: string;
      paid_at: string | null; created_at: string;
    }[]).map((r) => ({
      id: r.id,
      number: r.number,
      finalAmount: r.final_amount,
      status: r.status,
      paidAt: r.paid_at,
      createdAt: r.created_at,
    })),
    sessions: ((sessions.data ?? []) as {
      id: string; status: string; created_at: string;
      photoboxes: { name: string } | { name: string }[] | null;
    }[]).map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      photobox: r.photoboxes && !Array.isArray(r.photoboxes) ? r.photoboxes.name : null,
    })),
  };
}
