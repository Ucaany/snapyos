/**
 * Admin Subscriptions — docs/10 §10.2 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { extendIsoDays } from "@/lib/admin-math";
import {
  adminSubscriptionAddOnSchema,
  adminSubscriptionAddOnCancelSchema,
  adminSubscriptionAddOnUpdateSchema,
  adminSubscriptionUpdateSchema,
  type AdminSubscriptionAddOnUpdateInput,
  type AdminSubscriptionUpdateInput,
} from "@/lib/validators";
import { decideAttach, planCancelAddOn } from "@/lib/admin-addon-ops";
import { requireAdmin, audit } from "./guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminSubscriptionRow = {
  id: string;
  business_id: string;
  business_name: string;
  plan_name: string;
  plan_code: string;
  status: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  add_ons: { id: string; add_on_id: string; name: string; quantity: number }[];
  cancelled_add_on_ids: string[];
  last_invoice: { number: string; amount: number; status: string; paid_at: string | null } | null;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Kolom subscription yang dipilih (list + detail) — satu source of truth. */
const SUBSCRIPTION_SELECT =
  "id, business_id, status, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, businesses ( name ), plans ( name, code )";

type SubscriptionBaseRow = {
  id: string;
  business_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  businesses: { name: string } | { name: string }[] | null;
  plans: { name: string; code: string } | { name: string; code: string }[] | null;
};

/**
 * Enrich baris subscription mentah dengan add-ons aktif, add-on cancelled, dan
 * invoice terakhir — 2 query batch (anti N+1), dipakai list + detail.
 */
async function enrichSubscriptionRows(
  rows: SubscriptionBaseRow[]
): Promise<AdminSubscriptionRow[]> {
  const supabase = createServerClient();
  const subIds = rows.map((r) => r.id);

  type Link = {
    subscription_id: string;
    id: string;
    add_on_id: string;
    quantity: number;
    status: string;
    add_ons: { name: string } | { name: string }[] | null;
  };
  const linksBySub = new Map<string, Link[]>();
  const cancelledBySub = new Map<string, string[]>();
  if (subIds.length > 0) {
    const { data: links } = await supabase
      .from("subscription_add_ons")
      .select("subscription_id, id, add_on_id, quantity, status, add_ons ( name )")
      .in("subscription_id", subIds);
    for (const link of (links ?? []) as unknown as Link[]) {
      if (link.status === "cancelled") {
        const list = cancelledBySub.get(link.subscription_id) ?? [];
        list.push(link.add_on_id);
        cancelledBySub.set(link.subscription_id, list);
      } else {
        const list = linksBySub.get(link.subscription_id) ?? [];
        list.push(link);
        linksBySub.set(link.subscription_id, list);
      }
    }
  }

  type InvoiceRow = {
    subscription_id: string;
    number: string;
    amount: number;
    status: string;
    paid_at: string | null;
    created_at: string;
  };
  const lastInvoiceBySub = new Map<string, InvoiceRow>();
  if (subIds.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("subscription_id, number, amount, status, paid_at, created_at")
      .in("subscription_id", subIds)
      .order("created_at", { ascending: false });
    for (const inv of (invoices ?? []) as unknown as InvoiceRow[]) {
      if (!lastInvoiceBySub.has(inv.subscription_id)) {
        lastInvoiceBySub.set(inv.subscription_id, inv);
      }
    }
  }

  return rows.map((row) => {
    const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
    const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
    const inv = lastInvoiceBySub.get(row.id);
    return {
      id: row.id,
      business_id: row.business_id,
      business_name: business?.name ?? "-",
      plan_name: plan?.name ?? "-",
      plan_code: plan?.code ?? "-",
      status: row.status,
      trial_ends_at: row.trial_ends_at,
      current_period_start: row.current_period_start,
      current_period_end: row.current_period_end,
      cancel_at_period_end: row.cancel_at_period_end,
      add_ons: (linksBySub.get(row.id) ?? []).map((l) => ({
        id: l.id,
        add_on_id: l.add_on_id,
        name: (Array.isArray(l.add_ons) ? l.add_ons[0] : l.add_ons)?.name ?? "-",
        quantity: l.quantity,
      })),
      cancelled_add_on_ids: cancelledBySub.get(row.id) ?? [],
      last_invoice: inv
        ? {
            number: inv.number,
            amount: inv.amount,
            status: inv.status,
            paid_at: inv.paid_at,
          }
        : null,
    };
  });
}

export async function listSubscriptions(query: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: AdminSubscriptionRow[]; total: number }> {
  await requireAdmin();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));

  const supabase = createServerClient();
  let req = supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (query.status) req = req.eq("status", query.status);
  const { data, error, count } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat subscriptions");

  const rows = (data ?? []) as unknown as SubscriptionBaseRow[];
  const items = await enrichSubscriptionRows(rows);
  return { items, total: count ?? 0 };
}

/** Detail satu subscription (docs/10 §10.2) — shape identik item list. */
export async function getSubscription(subscriptionId: string): Promise<AdminSubscriptionRow> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!data) throw new ApiError("NOT_FOUND", "Subscription tidak ditemukan");
  const items = await enrichSubscriptionRows([data as unknown as SubscriptionBaseRow]);
  return items[0]!;
}

export async function updateSubscription(
  subscriptionId: string,
  input: AdminSubscriptionUpdateInput
) {
  const admin = await requireAdmin();
  const parsed = adminSubscriptionUpdateSchema.parse(input);
  const supabase = createServerClient();

  const { data: current } = await supabase
    .from("subscriptions")
    .select("id, business_id, current_period_end")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!current) throw new ApiError("NOT_FOUND", "Subscription tidak ditemukan");

  const patch: Record<string, unknown> = {};
  if (parsed.status !== undefined) patch.status = parsed.status;
  if (parsed.cancel) patch.cancel_at_period_end = true;
  if (parsed.extend_days) {
    patch.current_period_end = extendIsoDays(current.current_period_end, parsed.extend_days);
  }
  if (Object.keys(patch).length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Minimal satu aksi diisi");
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .update(patch)
    .eq("id", subscriptionId)
    .select("id, status, current_period_end, cancel_at_period_end")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui subscription");
  await audit(admin.id, "admin.subscription.update", subscriptionId, { ...parsed }, current.business_id);
  return data;
}

export async function attachSubscriptionAddOn(input: {
  subscription_id: string;
  add_on_id: string;
  quantity: number;
}) {
  const admin = await requireAdmin();
  const parsed = adminSubscriptionAddOnSchema.parse(input);
  const supabase = createServerClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, business_id")
    .eq("id", parsed.subscription_id)
    .maybeSingle();
  if (!sub) throw new ApiError("NOT_FOUND", "Subscription tidak ditemukan");

  // Upsert polos tidak mengembalikan row cancelled (status tetap) → cek existing
  // dulu, lalu reaktivasi bila status='cancelled' (fix inkon sistem admin/owner).
  const { data: existing } = await supabase
    .from("subscription_add_ons")
    .select("id, status")
    .eq("subscription_id", parsed.subscription_id)
    .eq("add_on_id", parsed.add_on_id)
    .maybeSingle();
  const decision = decideAttach(existing);

  type LinkOut = { id: string; add_on_id: string; quantity: number };
  const runUpdate = async (linkId: string, reactivate: boolean): Promise<LinkOut> => {
    const patch = reactivate
      ? { quantity: parsed.quantity, status: "active" as const, cancel_at_period_end: false }
      : { quantity: parsed.quantity };
    const { data: updated, error: updateError } = await supabase
      .from("subscription_add_ons")
      .update(patch)
      .eq("id", linkId)
      .select("id, add_on_id, quantity")
      .maybeSingle();
    if (updateError) throw new ApiError("INTERNAL", "Gagal menambah add-on");
    if (!updated) throw new ApiError("NOT_FOUND", "Add-on tidak ditemukan");
    return updated;
  };

  let data: LinkOut;
  let reactivated: boolean;
  if (decision.kind === "insert") {
    const { data: inserted, error } = await supabase
      .from("subscription_add_ons")
      .insert({
        subscription_id: parsed.subscription_id,
        add_on_id: parsed.add_on_id,
        quantity: parsed.quantity,
        status: "active",
      })
      .select("id, add_on_id, quantity")
      .single();
    if (!error) {
      data = inserted;
      reactivated = false;
    } else if (error.code === "23505") {
      // Race: row dibuat konkuren di antara select dan insert → jalur update.
      const { data: raced } = await supabase
        .from("subscription_add_ons")
        .select("id, status")
        .eq("subscription_id", parsed.subscription_id)
        .eq("add_on_id", parsed.add_on_id)
        .maybeSingle();
      if (!raced) throw new ApiError("INTERNAL", "Gagal menambah add-on");
      const racedDecision = decideAttach(raced);
      data = await runUpdate(raced.id, racedDecision.kind === "reactivate");
      reactivated = racedDecision.reactivated;
    } else {
      throw new ApiError("INTERNAL", "Gagal menambah add-on");
    }
  } else {
    data = await runUpdate((existing as { id: string }).id, decision.kind === "reactivate");
    reactivated = decision.reactivated;
  }

  await audit(
    admin.id,
    "admin.subscription.add_on.attach",
    parsed.subscription_id,
    { ...parsed, reactivated },
    sub.business_id
  );
  return { ...data, reactivated };
}

/** Update quantity add-on aktif (docs/10 §10.2) — hanya row status=active. */
export async function updateSubscriptionAddOn(
  linkId: string,
  input: AdminSubscriptionAddOnUpdateInput
) {
  const admin = await requireAdmin();
  const parsed = adminSubscriptionAddOnUpdateSchema.parse(input);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("subscription_add_ons")
    .update({ quantity: parsed.quantity })
    .eq("id", linkId)
    .eq("status", "active")
    .select("id, subscription_id, add_on_id, quantity")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui add-on");
  if (!data) throw new ApiError("NOT_FOUND", "Add-on aktif tidak ditemukan");

  const { data: subBiz } = await supabase
    .from("subscriptions")
    .select("business_id")
    .eq("id", data.subscription_id)
    .maybeSingle();
  await audit(
    admin.id,
    "admin.subscription.add_on.update",
    linkId,
    { subscription_id: data.subscription_id, add_on_id: data.add_on_id, quantity: parsed.quantity },
    (subBiz as { business_id: string } | null)?.business_id ?? null
  );
  return data;
}

export async function cancelSubscriptionAddOn(
  linkId: string,
  opts: { mode?: string; manual_cancel_reason?: string } = {}
) {
  const admin = await requireAdmin();
  const parsed = adminSubscriptionAddOnCancelSchema.parse({
    mode: opts.mode,
    manual_cancel_reason: opts.manual_cancel_reason,
  });
  const mode = parsed.mode ?? "deferred";
  const { values, auditMeta } = planCancelAddOn(mode, parsed.manual_cancel_reason);
  const supabase = createServerClient();

  let req = supabase.from("subscription_add_ons").update(values).eq("id", linkId).eq("status", "active");
  if (mode === "deferred") {
    // CAS guard parity owner cancelAddOn: cancel ulang saat sudah dijadwalkan
    // batal harus error, bukan diam-diam sukses (idempotency ekplisit).
    req = req.eq("cancel_at_period_end", false);
  }
  const { data, error } = await req.select("id, subscription_id").maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal membatalkan add-on");
  if (!data) {
    if (mode === "deferred") {
      throw new ApiError("VALIDATION_ERROR", "Add-on tidak aktif atau sudah dijadwalkan batal");
    }
    throw new ApiError("NOT_FOUND", "Add-on aktif tidak ditemukan");
  }
  // Finding #7: audit cancel tanpa business_id tak visible di query business-scoped.
  const { data: subBiz } = await supabase
    .from("subscriptions")
    .select("business_id")
    .eq("id", data.subscription_id)
    .maybeSingle();
  await audit(
    admin.id,
    "admin.subscription.add_on.cancel",
    linkId,
    { subscription_id: data.subscription_id, ...auditMeta },
    (subBiz as { business_id: string } | null)?.business_id ?? null
  );
  return { id: data.id, subscription_id: data.subscription_id, mode };
}
