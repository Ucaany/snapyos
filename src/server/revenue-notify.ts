import "server-only";

/**
 * Notifikasi revenue SnapyOS real-time (docs/02 §2.5/§2.6).
 *
 * Setiap event uang masuk / langganan / trial dikirim ke topic Telegram
 * yang dikonfigurasi (`SNAPYOS_TELEGRAM_*`) LENGKAP dengan riwayat bisnis
 * (total transaksi, transaksi terakhir, revenue hari ini/bulan ini).
 *
 * Prinsip: best-effort. Semua kegagalan ditelan + dicatat ke console —
 * notifikasi tidak boleh menggagalkan pembayaran, aktivasi paket, atau
 * onboarding.
 */

import { createServerClient } from "@/lib/supabase/server";
import {
  formatRevenueDigest,
  formatRevenueMessage,
  type RevenueDigestInput,
  type RevenueHistory,
  type RevenueHistoryLine,
  type RevenueItem,
  type RevenueKind,
} from "@/lib/revenue-message";
import { sendSnapyTopicHtml } from "@/server/snapyos-telegram";

type IntentItem = {
  type?: string;
  name?: string | null;
  code?: string | null;
  amount?: number | null;
  qty?: number | null;
};

type InvoiceRow = {
  number: string | null;
  amount: number | null;
  paid_at: string | null;
  intent: { items?: IntentItem[]; type?: string; name?: string | null } | null;
};

function itemLabel(item: IntentItem): string {
  if (item.name && item.name.trim().length > 0) return item.name;
  if (item.code) return item.code;
  if (item.type === "template_purchase") return "Template premium";
  if (item.type === "add_on") return "Add-on";
  return "Langganan";
}

/** Rincian item invoice → label+qty+nominal untuk pesan + jenis event. */
export function describeInvoiceItems(
  row: Pick<InvoiceRow, "amount" | "intent">
): { items: RevenueItem[]; kind: RevenueKind } {
  const raw = Array.isArray(row.intent?.items) ? row.intent!.items! : [];
  const amount = row.amount ?? 0;
  if (raw.length === 0) {
    const fallbackKind: RevenueKind =
      row.intent?.type === "template_purchase"
        ? "template"
        : row.intent?.type === "add_on"
          ? "add_on"
          : "plan_change";
    return {
      items: [{ label: row.intent?.name ?? "Langganan", qty: 1, amount }],
      kind: fallbackKind,
    };
  }
  const items = raw.map((item) => ({
    label: itemLabel(item),
    qty: Number(item.qty ?? 1) || 1,
    amount: Number(item.amount ?? 0),
  }));
  const types = new Set(raw.map((item) => item.type ?? ""));
  const kind: RevenueKind = types.has("template_purchase")
    ? "template"
    : types.has("plan_change")
      ? "plan_change"
      : types.has("add_on")
        ? "add_on"
        : "plan_change";
  return { items, kind };
}

/** Awal hari & awal bulan dalam WIB sebagai ISO UTC. */
export function wibPeriodStart(now = new Date(), unit: "day" | "month" = "day"): Date {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  const startShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    unit === "day" ? shifted.getUTCDate() : 1,
    0,
    0,
    0,
    0
  );
  return new Date(startShifted - WIB_OFFSET_MS);
}

async function loadRevenueTotals(
  supabase: ReturnType<typeof createServerClient>
): Promise<{ todayAmount: number; monthAmount: number }> {
  const dayStart = wibPeriodStart(new Date(), "day").toISOString();
  const monthStart = wibPeriodStart(new Date(), "month").toISOString();
  const { data } = await supabase
    .from("invoices")
    .select("amount, paid_at")
    .eq("status", "paid")
    .gte("paid_at", monthStart)
    .limit(5000);
  const rows = (data ?? []) as { amount: number | null; paid_at: string | null }[];
  let todayAmount = 0;
  let monthAmount = 0;
  for (const row of rows) {
    const amount = row.amount ?? 0;
    monthAmount += amount;
    if (row.paid_at && row.paid_at >= dayStart) todayAmount += amount;
  }
  return { todayAmount, monthAmount };
}

async function loadBusinessHistory(
  supabase: ReturnType<typeof createServerClient>,
  businessId: string
): Promise<RevenueHistory | null> {
  const [{ data: business }, { data: invoices }, { data: totalsRows }] = await Promise.all([
    supabase
      .from("businesses")
      .select("created_at, subscriptions ( status, trial_ends_at, created_at )")
      .eq("id", businessId)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select("number, amount, paid_at, intent")
      .eq("business_id", businessId)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(5),
    supabase
      .from("invoices")
      .select("amount")
      .eq("business_id", businessId)
      .eq("status", "paid")
      .limit(1000),
  ]);
  if (!business) return null;

  const businessRow = business as {
    created_at: string | null;
    subscriptions: { status: string; trial_ends_at: string | null }[] | null;
  };
  const subs = Array.isArray(businessRow.subscriptions) ? businessRow.subscriptions : [];
  const latestSub = subs[0] ?? null;
  const rows = (invoices ?? []) as InvoiceRow[];
  const allAmounts = (totalsRows ?? []) as { amount: number | null }[];
  const recent: RevenueHistoryLine[] = rows.slice(0, 3).map((row) => ({
    at: row.paid_at ?? "",
    label: describeInvoiceItems(row).items[0]?.label ?? "Langganan",
    amount: row.amount ?? 0,
  }));
  const totals = await loadRevenueTotals(supabase);
  const { count: activeTrials } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "trial");

  return {
    paidCount: allAmounts.length,
    lifetimeAmount: allAmounts.reduce((sum, row) => sum + (row.amount ?? 0), 0),
    lastPaidAt: rows[0]?.paid_at ?? null,
    joinedAt: businessRow.created_at,
    trialEndsAt: latestSub?.trial_ends_at ?? null,
    recent,
    todayAmount: totals.todayAmount,
    monthAmount: totals.monthAmount,
    activeTrials: activeTrials ?? undefined,
  };
}

export type RevenueEventInput = {
  kind: RevenueKind;
  businessId?: string;
  businessName?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  planName?: string | null;
  amount?: number;
  items?: RevenueItem[];
  invoiceNumber?: string | null;
  provider?: string | null;
  occurredAt?: string | null;
  periodEnd?: string | null;
  trialDays?: number | null;
};

/** Kirim satu event revenue ke topic Telegram (best-effort, tidak melempar). */
export async function notifyRevenueEvent(input: RevenueEventInput): Promise<boolean> {
  try {
    const supabase = createServerClient();
    let history: RevenueHistory | null = null;
    if (input.businessId && !input.businessName) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("name")
        .eq("id", input.businessId)
        .maybeSingle();
      input.businessName = (biz as { name?: string } | null)?.name ?? null;
    }
    if (input.businessId) {
      try {
        history = await loadBusinessHistory(supabase, input.businessId);
      } catch (error) {
        console.error(
          "[revenue-notify] gagal memuat riwayat",
          error instanceof Error ? error.message : "unknown"
        );
      }
    }
    if (!input.ownerEmail && input.businessId) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("owner_id")
        .eq("id", input.businessId)
        .maybeSingle();
      const ownerId = (biz as { owner_id?: string } | null)?.owner_id;
      if (ownerId) {
        const { data: ownerRow } = await supabase
          .from("users")
          .select("email, name")
          .eq("id", ownerId)
          .maybeSingle();
        const owner = ownerRow as { email?: string; name?: string | null } | null;
        if (owner?.email) {
          input.ownerEmail = owner.email;
          input.ownerName = input.ownerName ?? owner.name ?? undefined;
        }
      }
    }
    const text = formatRevenueMessage({ ...input, history });
    return await sendSnapyTopicHtml(text, "revenue");
  } catch (error) {
    console.error(
      "[revenue-notify] gagal mengirim notifikasi",
      error instanceof Error ? error.message : "unknown"
    );
    return false;
  }
}

/**
 * Checkout langganan/template dibuat (invoice pending, belum dibayar).
 * Memberi tahu setiap percobaan transaksi subscription walau akhirnya gagal
 * bayar. Matikan dengan SNAPYOS_TELEGRAM_NOTIFY_CHECKOUT=0.
 */
export async function notifyCheckoutStarted(
  input: Omit<RevenueEventInput, "kind">
): Promise<boolean> {
  if (process.env.SNAPYOS_TELEGRAM_NOTIFY_CHECKOUT === "0") return false;
  return notifyRevenueEvent({ ...input, kind: "checkout" });
}

/** Rekap harian revenue + trial (dipanggil cron /api/cron/revenue-digest). */
export async function sendRevenueDigest(now = new Date()): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const dayStart = wibPeriodStart(now, "day").toISOString();
    const monthStart = wibPeriodStart(now, "month").toISOString();

    const { data: todayData } = await supabase
      .from("invoices")
      .select("amount, paid_at, intent, business_id, businesses ( name )")
      .eq("status", "paid")
      .gte("paid_at", dayStart)
      .order("paid_at", { ascending: false })
      .limit(2000);
    const { data: monthData } = await supabase
      .from("invoices")
      .select("amount")
      .eq("status", "paid")
      .gte("paid_at", monthStart)
      .limit(20000);
    const { count: newTrialsToday } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "trial")
      .gte("created_at", dayStart);
    const { count: activeTrials } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "trial");

    type TodayRow = {
      amount: number | null;
      intent: InvoiceRow["intent"];
      businesses: { name: string } | { name: string }[] | null;
    };
    const today = (todayData ?? []) as unknown as TodayRow[];
    const byKind = new Map<string, { count: number; amount: number }>();
    const byBusiness = new Map<string, number>();
    let revenueToday = 0;
    for (const row of today) {
      const amount = row.amount ?? 0;
      revenueToday += amount;
      const label = describeInvoiceItems(row).items[0]?.label ?? "Langganan";
      const bucket = byKind.get(label) ?? { count: 0, amount: 0 };
      bucket.count += 1;
      bucket.amount += amount;
      byKind.set(label, bucket);
      const rel = row.businesses;
      const name = (Array.isArray(rel) ? rel[0] : rel)?.name ?? "Tanpa nama";
      byBusiness.set(name, (byBusiness.get(name) ?? 0) + amount);
    }
    const monthRows = (monthData ?? []) as { amount: number | null }[];
    const digest: RevenueDigestInput = {
      periodLabel: now.toLocaleDateString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      revenueToday,
      transactionsToday: today.length,
      revenueMonth: monthRows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
      transactionsMonth: monthRows.length,
      newTrialsToday: newTrialsToday ?? 0,
      activeTrials: activeTrials ?? 0,
      byKind: [...byKind.entries()]
        .map(([label, value]) => ({ label, ...value }))
        .sort((a, b) => b.amount - a.amount),
      topBusinesses: [...byBusiness.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
    };
    return await sendSnapyTopicHtml(formatRevenueDigest(digest), "revenue");
  } catch (error) {
    console.error(
      "[revenue-notify] gagal mengirim rekap",
      error instanceof Error ? error.message : "unknown"
    );
    return false;
  }
}
