/**
 * Admin Overview + Payments monitoring — docs/10 §10.1, §10.3 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { paymentSummary, sumMrr, type FeePolicy } from "@/lib/admin-math";
import { isSubscriptionEffective } from "@/lib/subscription-math";
import { requireAdmin } from "./guard";

// ---------------------------------------------------------------------------
// Overview — docs/10 §10.1
// ---------------------------------------------------------------------------

export type AdminOverview = {
  totalBusinesses: number;
  activeSubscribers: number;
  totalSubscriptions: number;
  mrr: number;
  totalOutlets: number;
  totalPhotoboxes: number;
  totalSessions: number;
  totalTransactions: number;
};

/** Guarded entry — autentikasi admin dulu, baru overview (H1 audit). */
export async function getAdminOverviewGuarded(): Promise<AdminOverview> {
  await requireAdmin();
  const supabase = createServerClient();
  const [businesses, subscriptions, outlets, photoboxes, sessions, transactions] =
    await Promise.all([
      supabase.from("businesses").select("id", { count: "exact", head: true }),
      supabase
        .from("subscriptions")
        .select("status, trial_ends_at, current_period_end, plans ( price_monthly )"),
      supabase.from("outlets").select("id", { count: "exact", head: true }),
      supabase.from("photoboxes").select("id", { count: "exact", head: true }),
      supabase.from("sessions").select("id", { count: "exact", head: true }),
      supabase.from("transactions").select("id", { count: "exact", head: true }),
    ]);

  const err =
    businesses.error ||
    subscriptions.error ||
    outlets.error ||
    photoboxes.error ||
    sessions.error ||
    transactions.error;
  if (err) throw new ApiError("INTERNAL", "Gagal memuat overview");

  type SubRow = {
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    plans: { price_monthly: number } | null;
  };
  const subs = (subscriptions.data ?? []) as unknown as SubRow[];
  // A-001: status `active` saja tidak cukup — periode harus masih berlaku.
  const active = subs.filter((s) =>
    isSubscriptionEffective(s.status, s.trial_ends_at, s.current_period_end)
  );
  return {
    totalBusinesses: businesses.count ?? 0,
    activeSubscribers: active.length,
    totalSubscriptions: subs.length,
    // ponytail: MRR dari snapshot plan saat ini — upgrade ke kolom snapshot
    // harga per subscription saat invoice history dipakai (Phase 10 invoice).
    mrr: sumMrr(active.map((s) => ({ plan: s.plans }))),
    totalOutlets: outlets.count ?? 0,
    totalPhotoboxes: photoboxes.count ?? 0,
    totalSessions: sessions.count ?? 0,
    totalTransactions: transactions.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Subscription stats — docs/10 §10.2 (status scale + renewal pressure)
// ---------------------------------------------------------------------------

export type AdminSubscriptionStats = {
  total: number;
  statusCounts: Record<string, number>;
  effectiveActive: number;
  trialsEndingSoon: number;
  renewalsDueSoon: number;
  pastDue: number;
  planSplit: { planName: string; count: number; mrr: number }[];
};

/**
 * Agregat subscription untuk panel admin. `renewalsDueSoon` = active yang
 * periodenya habis dalam 7 hari; `trialsEndingSoon` = trial berakhir <= 3 hari.
 * Semua hitungan memakai tanggal, bukan hanya string status.
 */
export async function getSubscriptionStats(): Promise<AdminSubscriptionStats> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end, plans ( name, price_monthly )");
  if (error) throw new ApiError("INTERNAL", "Gagal memuat statistik langganan");

  type Row = {
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    plans: { name: string; price_monthly: number } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const now = Date.now();
  const in3Days = now + 3 * 86_400_000;
  const in7Days = now + 7 * 86_400_000;

  const statusCounts: Record<string, number> = {
    trial: 0,
    active: 0,
    past_due: 0,
    cancelled: 0,
    expired: 0,
  };
  let effectiveActive = 0;
  let trialsEndingSoon = 0;
  let renewalsDueSoon = 0;
  const plans = new Map<string, { count: number; mrr: number }>();

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    const effective = isSubscriptionEffective(
      row.status,
      row.trial_ends_at,
      row.current_period_end
    );

    if (effective) {
      effectiveActive += 1;
      const name = row.plans?.name ?? "Tanpa paket";
      const current = plans.get(name) ?? { count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += row.plans?.price_monthly ?? 0;
      plans.set(name, current);
    }

    const trialEnd = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : null;
    if (row.status === "trial" && trialEnd && trialEnd >= now && trialEnd <= in3Days) {
      trialsEndingSoon += 1;
    }

    const periodEnd = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
    if (row.status === "active" && periodEnd && periodEnd >= now && periodEnd <= in7Days) {
      renewalsDueSoon += 1;
    }
  }

  return {
    total: rows.length,
    statusCounts,
    effectiveActive,
    trialsEndingSoon,
    renewalsDueSoon,
    pastDue: statusCounts.past_due ?? 0,
    planSplit: [...plans.entries()]
      .map(([planName, value]) => ({ planName, ...value }))
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Payments monitoring — docs/10 §10.3
// ---------------------------------------------------------------------------

export type AdminPaymentRow = {
  id: string;
  order_id: string | null;
  payment_reference: string;
  provider: string;
  status: string;
  gross_amount: number;
  discount_amount: number;
  final_amount: number;
  business_name: string;
  created_at: string;
  paid_at: string | null;
};

export type AdminPaymentQuery = {
  status?: string;
  provider?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export async function listPayments(query: AdminPaymentQuery): Promise<{
  items: AdminPaymentRow[];
  total: number;
}> {
  await requireAdmin();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));

  const supabase = createServerClient();
  let req = supabase
    .from("payments")
    .select(
      "id, order_id, payment_reference, provider, status, gross_amount, discount_amount, final_amount, created_at, paid_at, businesses ( name )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (query.status) req = req.eq("status", query.status);
  if (query.provider) req = req.eq("provider", query.provider);
  if (query.from) req = req.gte("created_at", `${query.from}T00:00:00.000Z`);
  if (query.to) req = req.lte("created_at", `${query.to}T23:59:59.999Z`);

  const { data, error, count } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat payments");

  type Row = AdminPaymentRow & { businesses: { name: string } | { name: string }[] | null };
  const items = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    business_name: (Array.isArray(r.businesses) ? r.businesses[0] : r.businesses)?.name ?? "-",
  }));
  return { items, total: count ?? 0 };
}

export type AdminPaymentSummary = ReturnType<typeof paymentSummary> & {
  range: { from: string | null; to: string | null };
  webhookIntegrity: { total: number; invalidSignature: number; errors: number };
};

/** Fee policy per business: subscription aktif terakhir → plan fee (docs/06 §6.6). */
async function feeByBusinessMap(): Promise<Map<string, FeePolicy>> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("business_id, status, trial_ends_at, current_period_end, plans ( platform_fee_percent, platform_fee_flat )")
    .in("status", ["trial", "active", "past_due"])
    .order("created_at", { ascending: false });
  type Row = {
    business_id: string;
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    plans: { platform_fee_percent: number; platform_fee_flat: number } | null;
  };
  const map = new Map<string, FeePolicy>();
  for (const row of (data ?? []) as unknown as Row[]) {
    // A-017: fee hanya berlaku bila periode subscription masih efektif.
    if (!isSubscriptionEffective(row.status, row.trial_ends_at, row.current_period_end)) continue;
    if (!map.has(row.business_id) && row.plans) {
      map.set(row.business_id, {
        percent: row.plans.platform_fee_percent,
        flat: row.plans.platform_fee_flat,
      });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Database health — ringkasan isi tabel + breakdown user (docs/10 §10.1 ekstra)
// ---------------------------------------------------------------------------

export type UserBreakdown = {
  total: number;
  admins: number;
  regular: number;
  active: number;
  suspended: number;
  verified: number;
  unverified: number;
  withBusiness: number;
  withoutBusiness: number;
};

export type DatabaseHealth = {
  users: UserBreakdown;
  tables: { name: string; count: number }[];
  pendingReview: number;
  webhookErrors: number;
};

const HEALTH_TABLES = [
  "businesses",
  "subscriptions",
  "invoices",
  "invoice_payments",
  "payments",
  "transactions",
  "sessions",
  "checkout_sessions",
  "photos",
  "outlets",
  "photoboxes",
  "devices",
  "customers",
  "support_tickets",
  "audit_logs",
] as const;

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  await requireAdmin();
  const supabase = createServerClient();

  const [userRows, ownerRows, pendingReview, webhookErrors, ...tableCounts] = await Promise.all([
    supabase.from("users").select("id, role, status, email_verified"),
    supabase.from("businesses").select("owner_id"),
    supabase
      .from("subscription_intent_failures")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("payment_webhooks")
      .select("id", { count: "exact", head: true })
      .eq("status", "error"),
    ...HEALTH_TABLES.map((t) => supabase.from(t).select("id", { count: "exact", head: true })),
  ]);

  const users = (userRows.data ?? []) as unknown as {
    id: string;
    role: string;
    status: string;
    email_verified: string | null;
  }[];
  const ownerIds = new Set(
    ((ownerRows.data ?? []) as unknown as { owner_id: string }[]).map((o) => o.owner_id)
  );
  const withBusiness = users.filter((u) => ownerIds.has(u.id)).length;

  const usersBreakdown: UserBreakdown = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    regular: users.filter((u) => u.role !== "admin").length,
    active: users.filter((u) => u.status !== "suspended").length,
    suspended: users.filter((u) => u.status === "suspended").length,
    verified: users.filter((u) => u.email_verified !== null).length,
    unverified: users.filter((u) => u.email_verified === null).length,
    withBusiness,
    withoutBusiness: users.length - withBusiness,
  };

  return {
    users: usersBreakdown,
    tables: HEALTH_TABLES.map((name, i) => ({
      name,
      count: (tableCounts[i]?.count as number | undefined) ?? 0,
    })),
    pendingReview: pendingReview.count ?? 0,
    webhookErrors: webhookErrors.count ?? 0,
  };
}

export type AdminAnalytics = {
  days: number;
  series: { date: string; revenue: number; txCount: number; sessionCount: number }[];
};

/** Deret harian 30 hari terakhir (platform-wide) untuk chart overview. */
export async function getAdminAnalytics(days = 30): Promise<AdminAnalytics> {
  await requireAdmin();
  const supabase = createServerClient();
  const from = new Date(Date.now() - (days - 1) * 86_400_000);
  const fromIso = from.toISOString().slice(0, 10);

  const [tx, ses] = await Promise.all([
    supabase
      .from("transactions")
      .select("paid_at, created_at, final_amount, status")
      .or(`created_at.gte.${fromIso}T00:00:00.000Z,paid_at.gte.${fromIso}T00:00:00.000Z`),
    supabase.from("sessions").select("created_at").gte("created_at", `${fromIso}T00:00:00.000Z`),
  ]);
  if (tx.error || ses.error) throw new ApiError("INTERNAL", "Gagal memuat analitik");

  const rev = new Map<string, number>();
  const txCount = new Map<string, number>();
  for (const r of (tx.data ?? []) as unknown as {
    paid_at: string | null;
    created_at: string;
    final_amount: number;
    status: string;
  }[]) {
    const key = (r.status === "paid" ? r.paid_at : r.created_at)?.slice(0, 10);
    if (!key) continue;
    if (r.status === "paid") {
      rev.set(key, (rev.get(key) ?? 0) + Math.max(0, r.final_amount));
    }
    txCount.set(key, (txCount.get(key) ?? 0) + 1);
  }
  const sesCount = new Map<string, number>();
  for (const r of (ses.data ?? []) as unknown as { created_at: string }[]) {
    const key = r.created_at.slice(0, 10);
    sesCount.set(key, (sesCount.get(key) ?? 0) + 1);
  }

  const series: AdminAnalytics["series"] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    series.push({
      date: d,
      revenue: rev.get(d) ?? 0,
      txCount: txCount.get(d) ?? 0,
      sessionCount: sesCount.get(d) ?? 0,
    });
  }
  return { days, series };
}

export async function getPaymentsSummary(query: {
  from?: string;
  to?: string;
}): Promise<AdminPaymentSummary> {
  await requireAdmin();
  const supabase = createServerClient();

  let req = supabase
    .from("payments")
    .select("business_id, final_amount, status, provider, businesses ( name )");
  if (query.from) req = req.gte("created_at", `${query.from}T00:00:00.000Z`);
  if (query.to) req = req.lte("created_at", `${query.to}T23:59:59.999Z`);
  const [{ data, error }, fees, hooks] = await Promise.all([
    req,
    feeByBusinessMap(),
    supabase.from("payment_webhooks").select("signature_valid, status"),
  ]);
  if (error) throw new ApiError("INTERNAL", "Gagal memuat ringkasan payment");

  type Row = {
    business_id: string;
    final_amount: number;
    status: string;
    provider: string;
    businesses: { name: string } | { name: string }[] | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    business_id: r.business_id,
    business_name: (Array.isArray(r.businesses) ? r.businesses[0] : r.businesses)?.name ?? "-",
    final_amount: r.final_amount,
    status: r.status,
    provider: r.provider,
  }));
  const summary = paymentSummary(rows, fees);

  type HookRow = { signature_valid: boolean | null; status: string };
  const hookRows = (hooks.data ?? []) as unknown as HookRow[];
  return {
    ...summary,
    range: { from: query.from ?? null, to: query.to ?? null },
    webhookIntegrity: {
      total: hookRows.length,
      invalidSignature: hookRows.filter((h) => h.signature_valid === false).length,
      errors: hookRows.filter((h) => h.status === "error").length,
    },
  };
}
