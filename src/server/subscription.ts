import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { invoiceNumber, planChangeAllowed, effectiveSessions } from "@/lib/subscription-math";
import { countOnline } from "@/lib/device-online";
import { insertAudit } from "@/server/audit";
import { getEffectiveSubscriptionRow } from "@/server/require-subscription";
import { consumeSubscriptionPromo, releaseSubscriptionPromo } from "@/server/subscription-promo";
import { sendSubscriptionStartedEmail } from "@/server/lifecycle-email";
import { storageAddOnDisplayName } from "@/lib/storage-units";

/**
 * Subscription owner — docs/02 (billing), docs/08 §8.15, docs/12 Phase 10.
 * View: semua member; mutasi (ubah plan/cancel/resume/add-on): owner saja.
 * Invoice pending bisa dibayar via QRIS (server/payment/invoice.ts).
 */

export type PlanCard = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  maxOutlets: number;
  maxPhotoboxes: number;
  maxConcurrentSessions: number;
  maxStaff: number;
  features: Record<string, boolean>;
};

// Intent activation core tinggal di modul lib yang testable
// (src/lib/subscription-intent-apply.ts — tanpa server-only/@/ agar bisa
// di-test node --test). Import sebagai binding lokal + re-export untuk
// kompatibilitas konsumen existing (server/payment/invoice.ts).
import {
  applyInvoiceIntentWithDeps,
  intentToItems,
  INTENT_FAILURE_REASON,
  buildReleasedIntent,
  buildFailureSnapshot,
  type InvoiceIntentItem,
  type IntentShape,
  type IntentFailureReason,
  type ApplyIntentDeps,
  type IntentDb,
} from "@/lib/subscription-intent-apply";

export { intentToItems, INTENT_FAILURE_REASON, buildReleasedIntent, buildFailureSnapshot };
export type { InvoiceIntentItem, IntentShape, IntentFailureReason, ApplyIntentDeps, IntentDb };

/** Nama tampilan invoice (tabel invoice, receipt, halaman bayar). */
function intentDisplayName(intent: IntentShape, fallbackAmount: number): string {
  return intentToItems(intent, fallbackAmount)
    .map((i) =>
      i.qty > 1 ? `${i.name ?? i.code ?? i.type} ×${i.qty}` : (i.name ?? i.code ?? i.type)
    )
    .join(" + ");
}

export type InvoiceRow = {
  id: string;
  number: string;
  amount: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
  intent: { type?: string; name?: string } | null;
};

export type AddOnCard = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  unit: string;
};

export type ActiveAddOn = {
  addOnId: string;
  code: string;
  name: string;
  priceMonthly: number;
  quantity: number;
  cancelAtPeriodEnd: boolean;
};

export type SubscriptionOverview = {
  subscription: {
    id: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    plan: PlanCard | null;
    addOns: ActiveAddOn[];
  } | null;
  usage: {
    outlets: number;
    photoboxes: number;
    staff: number;
    activeSessions: number;
    maxConcurrentSessions: number;
  };
  invoices: InvoiceRow[];
  plans: PlanCard[];
  addOns: AddOnCard[];
};

async function requireMember(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  return membership;
}

async function requireOwner(userId: string, businessId: string) {
  const membership = await requireMember(userId, businessId);
  if (!can(membership.role, "subscription:write")) {
    throw new ApiError("FORBIDDEN", "Hanya owner yang dapat mengubah subscription");
  }
  return membership;
}

/** Invoice pending baru — retry on unique-violation (seq count+1 bisa race). */
async function insertInvoice(input: {
  businessId: string;
  subscriptionId: string;
  amount: number;
  intent?: Record<string, unknown> | null;
}): Promise<{ invoiceId: string; number: string }> {
  const supabase = createServerClient();
  const now = new Date();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("business_id", input.businessId);
    const candidate = invoiceNumber((count ?? 0) + 1, now);
    const { data: inv, error: invError } = await supabase
      .from("invoices")
      .insert({
        business_id: input.businessId,
        subscription_id: input.subscriptionId,
        number: candidate,
        amount: input.amount,
        status: "pending",
        intent: input.intent ?? null,
      })
      .select("id, number")
      .single();
    const invRow = inv as { id: string; number: string } | null;
    if (invRow) return { invoiceId: invRow.id, number: invRow.number };
    if (invError && invError.code !== "23505") {
      // Detail DB (code/message) hanya di-log server-side — tidak ikut ke
      // client (menghindari kebocoran skema/kolom yang belum bermigrasi).
      console.error("[subscription] invoice insert failed:", {
        db_code: invError.code,
        db_message: invError.message,
      });
      throw new ApiError("INTERNAL", "Gagal membuat invoice");
    }
  }
  throw new ApiError("INTERNAL", "Gagal membuat invoice (kolisi nomor berulang)");
}

export async function getSubscriptionOverview(
  userId: string,
  businessId: string
): Promise<SubscriptionOverview> {
  // Langganan & tagihan = owner-only (docs/09 §9.2). `subscription:read`
  // juga diberikan ke manager (dipakai pembelian template premium), jadi
  // gate di sini memakai `subscription:write` yang owner-only.
  await requireOwner(userId, businessId);
  const supabase = createServerClient();

  const [subRes, planRes, invRes, addOnRes, outletsRes, boxesRes, staffRes, devicesRes] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select(
          "id, status, cancel_at_period_end, trial_ends_at, current_period_end, plans ( id, code, name, price_monthly, max_outlets, max_photoboxes, max_concurrent_sessions, max_staff, features )"
        )
        .eq("business_id", businessId)
        .in("status", ["trial", "active", "past_due", "expired"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("plans")
        .select(
          "id, code, name, price_monthly, max_outlets, max_photoboxes, max_concurrent_sessions, max_staff, features"
        )
        .eq("is_active", true)
        .order("price_monthly", { ascending: true }),
      supabase
        .from("invoices")
        .select("id, number, amount, status, paid_at, created_at, intent")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("add_ons")
        .select("id, code, name, price_monthly, unit, storage_mb")
        .eq("is_active", true)
        .order("price_monthly", { ascending: true }),
      supabase
        .from("outlets")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      supabase
        .from("photoboxes")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      supabase
        .from("business_members")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      supabase
        .from("devices")
        .select("status, last_seen_at, last_heartbeat_at")
        .eq("business_id", businessId),
    ]);

  type PlanJoin = {
    id: string;
    code: string;
    name: string;
    price_monthly: number;
    max_outlets: number;
    max_photoboxes: number;
    max_concurrent_sessions: number;
    max_staff: number;
    features: Record<string, boolean>;
  };

  const subRow = subRes.data as {
    id: string;
    status: string;
    cancel_at_period_end: boolean;
    trial_ends_at: string | null;
    current_period_end: string | null;
    plans: PlanJoin | PlanJoin[] | null;
  } | null;

  const toPlan = (p: PlanJoin | PlanJoin[] | null) => {
    if (!p || Array.isArray(p)) return null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      priceMonthly: p.price_monthly,
      maxOutlets: p.max_outlets,
      maxPhotoboxes: p.max_photoboxes,
      maxConcurrentSessions: p.max_concurrent_sessions,
      maxStaff: p.max_staff,
      features: p.features ?? {},
    };
  };

  // Add-on aktif milik subscription ini (docs/02 §2.9).
  const { data: activeAddOnRows } = subRow
    ? await supabase
        .from("subscription_add_ons")
        .select(
          "add_on_id, quantity, cancel_at_period_end, add_ons ( code, name, price_monthly, unit, storage_mb )"
        )
        .eq("subscription_id", subRow.id)
        .eq("status", "active")
    : { data: null };
  const activeAddOns = (
    (activeAddOnRows ?? []) as unknown as {
      add_on_id: string;
      quantity: number;
      cancel_at_period_end: boolean;
      add_ons:
        | {
            code: string;
            name: string;
            price_monthly: number;
            unit: string;
            storage_mb: number | null;
          }
        | {
            code: string;
            name: string;
            price_monthly: number;
            unit: string;
            storage_mb: number | null;
          }[]
        | null;
    }[]
  ).map((r) => {
    const a = r.add_ons && !Array.isArray(r.add_ons) ? r.add_ons : null;
    return {
      addOnId: r.add_on_id,
      code: a?.code ?? "",
      name: a
        ? storageAddOnDisplayName({
            name: a.name,
            unit: a.unit,
            storageMb: a.storage_mb,
          })
        : "",
      priceMonthly: a?.price_monthly ?? 0,
      quantity: r.quantity,
      cancelAtPeriodEnd: r.cancel_at_period_end ?? false,
    };
  });

  const plan = toPlan(subRow?.plans ?? null);
  const maxConcurrentSessions = plan
    ? effectiveSessions(
        plan.maxConcurrentSessions,
        activeAddOns.map((a) => a.quantity)
      )
    : 0;

  return {
    subscription: subRow
      ? {
          id: subRow.id,
          status: subRow.status,
          cancelAtPeriodEnd: subRow.cancel_at_period_end,
          trialEndsAt: subRow.trial_ends_at,
          currentPeriodEnd: subRow.current_period_end,
          plan,
          addOns: activeAddOns,
        }
      : null,
    usage: {
      outlets: outletsRes.count ?? 0,
      photoboxes: boxesRes.count ?? 0,
      staff: staffRes.count ?? 0,
      activeSessions: countOnline(
        (devicesRes.data ?? []) as {
          status: string;
          last_seen_at: string | null;
          last_heartbeat_at?: string | null;
        }[]
      ),
      maxConcurrentSessions,
    },
    invoices: (invRes.data ?? []).map((r) => ({
      id: r.id,
      number: r.number,
      amount: r.amount,
      status: r.status,
      paidAt: r.paid_at,
      createdAt: r.created_at,
      intent: r.intent
        ? {
            type: (r.intent as IntentShape)?.type,
            name: intentDisplayName(r.intent as IntentShape, r.amount) || undefined,
          }
        : null,
    })),
    plans: (planRes.data ?? []).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      priceMonthly: p.price_monthly,
      maxOutlets: p.max_outlets,
      maxPhotoboxes: p.max_photoboxes,
      maxConcurrentSessions: p.max_concurrent_sessions,
      maxStaff: p.max_staff,
      features: (p.features as Record<string, boolean>) ?? {},
    })),
    addOns: (
      (addOnRes.data ?? []) as unknown as {
        id: string;
        code: string;
        name: string;
        price_monthly: number;
        unit: string;
        storage_mb: number | null;
      }[]
    ).map((a) => ({
      id: a.id,
      code: a.code,
      name: storageAddOnDisplayName({
        name: a.name,
        unit: a.unit,
        storageMb: a.storage_mb,
      }),
      priceMonthly: a.price_monthly,
      unit: a.unit,
    })),
  };
}

/**
 * Checkout subscription PAYMENT-FIRST (docs/02 §2.5) — dipanggil dari layar
 * konfirmasi (modal): plan (+ add-on custom qty, + promo code opsional) →
 * invoice pending terbit dengan harga fix → bayar via QRIS di halaman
 * pembayaran → plan & semua add-on aktif otomatis saat paid.
 * Backend = source of truth: total selalu dihitung ulang server-side.
 */
export async function createSubscriptionInvoice(
  userId: string,
  businessId: string,
  input: { planCode?: string; addOns?: { id: string; qty: number }[]; promoCode?: string }
) {
  await requireOwner(userId, businessId);

  const supabase = createServerClient();
  const { data: current } = await supabase
    .from("subscriptions")
    .select("id, status, plans ( id, code, name, price_monthly )")
    .eq("business_id", businessId)
    .in("status", ["trial", "active", "past_due", "expired"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentRow = current as {
    id: string;
    status: string;
    plans: { id: string; code: string; name: string; price_monthly: number } | null;
  } | null;
  if (!currentRow) throw new ApiError("NOT_FOUND", "Subscription tidak ditemukan");
  // Self-service recovery (docs/02 §2.4): owner expired boleh checkout lagi
  // — invoice recovery SELALU memuat plan_change (periode baru dari now(),
  // bukan extend periode lama). past_due dalam grace tetap jalur normal.
  const isRecovery = currentRow.status === "expired";
  const currentPlan =
    currentRow.plans && !Array.isArray(currentRow.plans) ? currentRow.plans : null;

  // Plan: pilih baru, atau lanjut plan aktif (checkout add-on saja).
  let planRow: {
    id: string;
    code: string;
    name: string;
    price_monthly: number;
    is_active: boolean;
    max_outlets: number;
    max_photoboxes: number;
    max_staff: number;
  };
  if (input.planCode) {
    const { data: plan } = await supabase
      .from("plans")
      .select("id, code, name, price_monthly, is_active, max_outlets, max_photoboxes, max_staff")
      .eq("code", input.planCode)
      .maybeSingle();
    planRow = (plan ?? null) as typeof planRow;
    if (!planRow) throw new ApiError("NOT_FOUND", "Plan tidak ditemukan");
    // Recovery (expired) mengecualikan guard "plan sama" — renew plan lama
    // adalah jalur self-service yang sah (docs/02 §2.4).
    if (
      !isRecovery &&
      !planChangeAllowed(currentPlan?.code ?? null, planRow.code, planRow.is_active)
    ) {
      // Add-on-only checkout boleh "memilih" plan yang sama.
      if (!(planRow.code === currentPlan?.code && (input.addOns?.length ?? 0) > 0)) {
        throw new ApiError("VALIDATION_ERROR", "Plan sama atau tidak tersedia");
      }
    }

    const [outletsRes, boxesRes, staffRes] = await Promise.all([
      supabase
        .from("outlets")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      supabase
        .from("photoboxes")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      supabase
        .from("business_members")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
    ]);
    const usage = {
      outlets: outletsRes.count ?? 0,
      photoboxes: boxesRes.count ?? 0,
      staff: staffRes.count ?? 0,
    };
    const over = [
      usage.outlets > planRow.max_outlets && `outlet ${usage.outlets}/${planRow.max_outlets}`,
      usage.photoboxes > planRow.max_photoboxes &&
        `photobox ${usage.photoboxes}/${planRow.max_photoboxes}`,
      usage.staff > planRow.max_staff && `staff ${usage.staff}/${planRow.max_staff}`,
    ].filter((v): v is string => Boolean(v));
    if (over.length > 0) {
      throw new ApiError(
        "PLAN_LIMIT_REACHED",
        `Pemakaian melebihi batas plan ${planRow.code}: ${over.join(", ")}. Kurangi dulu sebelum downgrade.`
      );
    }
  } else {
    if (!currentPlan) throw new ApiError("VALIDATION_ERROR", "Plan wajib dipilih");
    planRow = {
      id: currentPlan.id,
      code: currentPlan.code,
      name: currentPlan.name,
      price_monthly: currentPlan.price_monthly,
      is_active: true,
      max_outlets: 0,
      max_photoboxes: 0,
      max_staff: 0,
    };
  }

  // Add-on custom qty — merge duplikat id, qty 1..99.
  const qtyById = new Map<string, number>();
  for (const a of input.addOns ?? []) {
    if (!a?.id) continue;
    const qty = Math.floor(a.qty);
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
      throw new ApiError("VALIDATION_ERROR", "Jumlah add-on harus 1–99");
    }
    qtyById.set(a.id, (qtyById.get(a.id) ?? 0) + qty);
  }
  const addOnItems: { addOnId: string; code: string; name: string; price: number; qty: number }[] =
    [];
  if (qtyById.size > 0) {
    const { data: addOnRows } = await supabase
      .from("add_ons")
      .select("id, code, name, price_monthly, is_active, unit, storage_mb")
      .in("id", [...qtyById.keys()]);
    for (const raw of (addOnRows ?? []) as {
      id: string;
      code: string;
      name: string;
      price_monthly: number;
      is_active: boolean;
      unit: string;
      storage_mb: number | null;
    }[]) {
      if (!raw.is_active) continue;
      addOnItems.push({
        addOnId: raw.id,
        code: raw.code,
        name: storageAddOnDisplayName({
          name: raw.name,
          unit: raw.unit,
          storageMb: raw.storage_mb,
        }),
        price: raw.price_monthly,
        qty: qtyById.get(raw.id) ?? 0,
      });
    }
    if (addOnItems.length !== qtyById.size) {
      throw new ApiError("NOT_FOUND", "Add-on tidak ditemukan / tidak aktif");
    }
  }

  // Fix: only include plan_change item when plan actually changes.
  // Add-on-only checkout (no planCode or same plan) must NOT charge plan price.
  // Exception: recovery (expired) SELALU menyertakan plan_change — renew
  // plan lama/baru = aktivasi ulang, periode baru dari now() (docs/02 §2.4).
  const isActualPlanChange =
    isRecovery || (Boolean(input.planCode) && input.planCode !== currentPlan?.code);
  const items: InvoiceIntentItem[] = [
    ...(isActualPlanChange
      ? [
          {
            type: "plan_change" as const,
            plan_id: planRow.id,
            code: planRow.code,
            name: planRow.name,
            amount: planRow.price_monthly,
            qty: 1,
          },
        ]
      : []),
    ...addOnItems.map((a) => ({
      type: "add_on" as const,
      add_on_id: a.addOnId,
      code: a.code,
      name: a.name,
      amount: a.price,
      qty: a.qty,
    })),
  ];
  if (items.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Tidak ada perubahan: pilih plan baru atau add-on");
  }
  const gross = items.reduce((sum, i) => sum + i.amount * i.qty, 0);

  // Void SEMUA invoice pending dulu — hanya 1 tagihan aktif; kalau ternyata
  // sudah dibayar (race), webhook tetap recovery void → paid. Sebelum void,
  // baca kode promo invoice yang akan di-void lalu lepas kuotanya (anti leak
  // kuota: owner buat invoice ber-promo → ditinggalkan → promo tetap terpakai).
  // ponytail: void+release+insert belum atomik (supabase-js tanpa transaction);
  // race checkout konkuren masih bisa menciptakan 2 invoice pending. Upgrade
  // ke RPC bila jadi masalah — partial unique index 1-pending-per-business
  // terlalu ketat karena template purchase juga bikin invoice pending.
  const { data: pendingInvoices } = await supabase
    .from("invoices")
    .select("intent")
    .eq("business_id", businessId)
    .eq("status", "pending");
  await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("business_id", businessId)
    .eq("status", "pending");
  for (const inv of (pendingInvoices ?? []) as { intent: unknown }[]) {
    const promoCode = (inv.intent as { promo?: { code?: string } } | null)?.promo?.code;
    if (promoCode) {
      try {
        await releaseSubscriptionPromo(promoCode);
      } catch {
        // best-effort: gagal lepas kuota tidak membatalkan checkout.
      }
    }
  }

  let promo: { code: string; discount: number } | null = null;
  if (input.promoCode?.trim()) {
    promo = await consumeSubscriptionPromo(input.promoCode, gross);
  }
  const amount = Math.max(0, gross - (promo?.discount ?? 0));

  const { invoiceId, number } = await insertInvoice({
    businessId,
    subscriptionId: currentRow.id,
    amount,
    intent: { items, ...(promo ? { promo } : {}) },
  });

  await insertAudit({
    actorId: userId,
    businessId,
    action: "subscription.checkout",
    target: currentRow.id,
    meta: {
      plan: planRow.code,
      add_ons: addOnItems.map((a) => ({ code: a.code, qty: a.qty })),
      promo: promo?.code ?? null,
      invoice: number,
      gross,
      amount,
    },
  });

  return { invoiceId, invoiceNumber: number, amount, promo };
}

/** Cancel di akhir periode — akses tetap jalan sampai period end. */
export async function cancelSubscription(userId: string, businessId: string) {
  await requireOwner(userId, businessId);
  const supabase = createServerClient();

  // PostgREST menolak ORDER BY/LIMIT pada UPDATE (error 42703). Pilih baris
  // subscription aktif terbaru via SELECT dulu, lalu UPDATE by id.
  const { data: target } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("business_id", businessId)
    .in("status", ["trial", "active", "past_due"])
    .eq("cancel_at_period_end", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!target) throw new ApiError("VALIDATION_ERROR", "Subscription sudah dibatalkan");

  const { data, error } = await supabase
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("id", target.id)
    .select("id, current_period_end")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal membatalkan subscription");
  if (!data) throw new ApiError("NOT_FOUND", "Subscription tidak ditemukan");

  await insertAudit({
    actorId: userId,
    businessId,
    action: "subscription.cancel",
    target: data.id,
    meta: { period_end: data.current_period_end },
  });
  return { cancelAtPeriodEnd: true };
}

/** Batalkan penjadwalan cancel (lanjut langganan). */
export async function resumeSubscription(userId: string, businessId: string) {
  await requireOwner(userId, businessId);
  const supabase = createServerClient();

  // Sama seperti cancelSubscription: SELECT dulu (ORDER BY aman di SELECT),
  // lalu UPDATE by id agar tidak memicu 42703 pada UPDATE.
  const { data: target } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("business_id", businessId)
    .in("status", ["trial", "active", "past_due"])
    .eq("cancel_at_period_end", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!target) throw new ApiError("VALIDATION_ERROR", "Tidak ada cancel terjadwal");

  const { data, error } = await supabase
    .from("subscriptions")
    .update({ cancel_at_period_end: false })
    .eq("id", target.id)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal melanjutkan subscription");
  if (!data) throw new ApiError("NOT_FOUND", "Subscription tidak ditemukan");

  await insertAudit({
    actorId: userId,
    businessId,
    action: "subscription.resume",
    target: data.id,
    meta: {},
  });
  return { cancelAtPeriodEnd: false };
}

/** Batalkan add-on di akhir periode — tetap aktif sampai subscription period end. */
export async function cancelAddOn(userId: string, businessId: string, addOnId: string) {
  await requireOwner(userId, businessId);
  if (!addOnId) throw new ApiError("VALIDATION_ERROR", "Add-on wajib dipilih");

  const supabase = createServerClient();
  const subscription = await getEffectiveSubscriptionRow(businessId);
  if (!subscription) throw new ApiError("NOT_FOUND", "Subscription tidak ditemukan");

  // Mark for end-of-period cancellation (consistent with plan cancel behavior).
  // Add-on stays active until cron transitions it at period end.
  const { data } = await supabase
    .from("subscription_add_ons")
    .update({ cancel_at_period_end: true })
    .eq("subscription_id", subscription.id)
    .eq("add_on_id", addOnId)
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .select("id, quantity")
    .maybeSingle();
  const row = (data ?? null) as { id: string; quantity: number } | null;
  if (!row)
    throw new ApiError("VALIDATION_ERROR", "Add-on tidak aktif atau sudah dijadwalkan batal");

  await insertAudit({
    actorId: userId,
    businessId,
    action: "subscription.add_on_cancel",
    target: row.id,
    meta: { quantity: row.quantity, effective: "end_of_period" },
  });
  return { cancelled: true, effectiveAt: "end_of_period" };
}

/**
 * Terapkan intent invoice yang sudah dibayar — adaptor tipis produksi.
 * Seluruh logika (termasuk failure recording docs/02 §2.4b) tinggal di
 * `src/lib/subscription-intent-apply.ts` supaya bisa di-test tanpa
 * Next runtime. Di sini hanya wiring deps nyata: service-role client
 * + insertAudit.
 */

export async function applyInvoiceIntent(businessId: string, invoiceId: string) {
  await applyInvoiceIntentWithDeps(
    {
      db: createServerClient() as unknown as IntentDb,
      audit: (input) => insertAudit(input),
      notifyPlanActivated: async ({ businessId, invoiceId, planName }) => {
        // Email subscription_started untuk owner business (best-effort).
        const supabase = createServerClient();
        const { data: owner } = await supabase
          .from("business_members")
          .select("business_id, user:users(email, name)")
          .eq("business_id", businessId)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();
        const embedded = (owner?.user ?? null) as
          { email: string; name: string | null } | { email: string; name: string | null }[] | null;
        const u = embedded && !Array.isArray(embedded) ? embedded : null;
        if (u?.email) {
          await sendSubscriptionStartedEmail({
            email: u.email,
            name: u.name ?? u.email,
            planName,
            invoiceId,
          });
        }
      },
    },
    businessId,
    invoiceId
  );
}
