/**
 * Subscription invoice intent activation — core logic (docs/02 §2.4b).
 *
 * Modul ini PURE-ish: tanpa `server-only`, tanpa import `@/...`, tanpa
 * `next/*` — supaya bisa di-test dengan `node --test` (lihat
 * tests/subscription-intent-failure.test.ts). Konsumen produksi adalah
 * adaptor tipis `applyInvoiceIntent` di `src/server/subscription.ts`
 * yang menyuntik service-role client + insertAudit nyata.
 *
 * Kontrak utama: setiap early-return non-sukses SETELAH klaim atomik
 * `intent.applied=true` WAJIB lewat `recordActivationFailure` —
 * melepas klaim (retry-safe), menulis audit, dan mengantre review
 * manual di `subscription_intent_failures`. Menambah early-return baru
 * tanpa itu = bug silent data loss (uang settled, plan tidak aktif).
 */

import { ApiError } from "./api-errors.ts";
import { nextPeriod } from "./subscription-math.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvoiceIntentItem = {
  type: "plan_change" | "add_on" | "template_purchase";
  plan_id?: string;
  add_on_id?: string;
  template_id?: string;
  code?: string;
  name?: string;
  amount: number;
  qty: number;
};

export type IntentShape = {
  items?: InvoiceIntentItem[];
  type?: string;
  plan_id?: string;
  add_on_id?: string;
  template_id?: string;
  code?: string;
  name?: string;
  applied?: boolean;
} | null;

/**
 * Machine-readable reasons — mirror kolom
 * `subscription_intent_failures.reason` (migrasi 0041).
 */
export const INTENT_FAILURE_REASON = {
  SUBSCRIPTION_NOT_ACTIVE: "SUBSCRIPTION_NOT_ACTIVE",
  UPDATE_NO_ROW: "UPDATE_NO_ROW",
  MISSING_SUBSCRIPTION_ID: "MISSING_SUBSCRIPTION_ID",
  INTENT_EXCEPTION: "INTENT_EXCEPTION",
} as const;
export type IntentFailureReason =
  (typeof INTENT_FAILURE_REASON)[keyof typeof INTENT_FAILURE_REASON];

/** Normalisasi intent → daftar item (shape baru `items`, legacy single-item). */
export function intentToItems(intent: IntentShape, fallbackAmount: number): InvoiceIntentItem[] {
  if (!intent) return [];
  if (Array.isArray(intent.items) && intent.items.length > 0) {
    return intent.items.map((item) =>
      item.type === "add_on" && item.name
        ? { ...item, name: normalizeLegacyAddOnName(item.name) }
        : item
    );
  }
  return [
    {
      type:
        intent.type === "add_on"
          ? "add_on"
          : intent.type === "template_purchase"
            ? "template_purchase"
            : "plan_change",
      plan_id: intent.plan_id,
      add_on_id: intent.add_on_id,
      template_id: intent.template_id,
      code: intent.code,
      name: normalizeLegacyAddOnName(intent.name),
      amount: fallbackAmount,
      qty: 1,
    },
  ];
}

/**
 * Label seed lama "Tambah Storage 1 GB" → "Tambah Storage 1.024 MB".
 * Hanya bentuk seed yang dikenal; nama add-on lain dibiarkan apa adanya.
 */
function normalizeLegacyAddOnName(name: string | undefined): string | undefined {
  if (!name) return name;
  return /^Tambah Storage\s+1\s*GB$/i.test(name) ? "Tambah Storage 1.024 MB" : name;
}

// ---------------------------------------------------------------------------
// Deps (dependency injection untuk test)
// ---------------------------------------------------------------------------

/** Error shape minimal yang dipakai dari response Supabase. */
export type IntentDbError = { message: string } | null;

export type IntentDbResult = { data: unknown; error: IntentDbError };

/**
 * Builder query minimal — subset operasi yang dipakai aktivasi intent.
 * SupabaseClient asli memenuhi ini secara struktural (adaptor server
 * melakukan cast `as unknown as IntentDb`); fake di test
 * mengimplementasikan semantik yang sama (termasuk CAS claim).
 *
 * `IntentDbQuery` sendiri adalah thenable yang resolve ke `{data,error}`
 * supaya `await ...update(patch).eq(...).eq(...)` (tanpa terminal)
 * mengembalikan hasil yang sama seperti PostgREST builder asli.
 */
export interface IntentDbQuery extends PromiseLike<IntentDbResult> {
  select(cols?: string, opts?: unknown): IntentDbQuery;
  update(patch: Record<string, unknown>): IntentDbQuery;
  insert(row: Record<string, unknown>): PromiseLike<IntentDbResult>;
  upsert(row: Record<string, unknown>, opts?: Record<string, unknown>): PromiseLike<IntentDbResult>;
  eq(col: string, val: unknown): IntentDbQuery;
  or(cond: string): IntentDbQuery;
  in(col: string, vals: unknown[]): IntentDbQuery;
  maybeSingle(): Promise<IntentDbResult>;
}

export interface IntentDb {
  from(table: string): IntentDbQuery;
}

export type IntentAuditFn = (input: {
  actorId: string | null;
  businessId: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown>;
}) => Promise<void>;

export interface ApplyIntentDeps {
  db: IntentDb;
  audit: IntentAuditFn;
  /**
   * Hook best-effort setelah plan aktif (subscription_started email).
   * Opsional agar modul ini tetap pure & testable; produksi menyuntik
   * pengiriman email idempoten (src/server/lifecycle-email.ts). Tidak pernah
   * throw — kegagalan email tidak boleh membatalkan aktivasi yang sukses.
   */
  notifyPlanActivated?: (input: {
    businessId: string;
    invoiceId: string;
    planName: string;
  }) => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Pure helpers (di-test langsung)
// ---------------------------------------------------------------------------

/**
 * Bangun ulang intent dengan klaim CAS dilepas: `applied=false` +
 * `applied_at=null`. Keduanya membuat predikat CAS
 * `intent->>applied.is.null,intent->>applied.neq.true` cocok lagi pada
 * retry berikutnya. `applied_at` sengaja di-null (bukan dihapus) agar
 * terlihat bahwa pernah ada percobaan klaim.
 */
export function buildReleasedIntent(originalIntent: IntentShape): Record<string, unknown> {
  return { ...(originalIntent ?? {}), applied: false, applied_at: null };
}

/**
 * Snapshot intent untuk kolom `intent_snapshot`. Berbeda dari
 * `buildReleasedIntent`: snapshot mendokumentasikan apa yang dibeli
 * (items/type/plan/add-on), bukan status klaim — jadi flag CAS
 * `applied`/`applied_at` dibuang seluruhnya.
 */
export function buildFailureSnapshot(intent: IntentShape): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { ...(intent ?? {}) };
  delete snapshot.applied;
  delete (snapshot as { applied_at?: unknown }).applied_at;
  return snapshot;
}

// ---------------------------------------------------------------------------
// Failure recording
// ---------------------------------------------------------------------------

type InvoiceLike = {
  id: string;
  number: string;
  subscription_id: string | null;
  amount: number;
  intent: IntentShape;
};

async function releaseIntentClaim(
  db: IntentDb,
  invoiceId: string,
  originalIntent: IntentShape
): Promise<void> {
  const { error } = await db
    .from("invoices")
    .update({ intent: buildReleasedIntent(originalIntent) })
    .eq("id", invoiceId)
    // Hanya lepas baris yang sedang ter-claim — jangan timpa apply sukses
    // konkuren yang baru saja flip ke true.
    .eq("intent->>applied", "true");
  if (error) {
    console.error(
      "[subscription.applyInvoiceIntent] gagal release claim invoice=%s: %s",
      invoiceId,
      error.message
    );
  }
}

async function recordActivationFailure(
  deps: ApplyIntentDeps,
  args: {
    businessId: string;
    invoice: InvoiceLike;
    reason: IntentFailureReason;
    message?: string;
  }
): Promise<void> {
  const { db, audit } = deps;
  const { businessId, invoice, reason, message } = args;

  await releaseIntentClaim(db, invoice.id, invoice.intent);
  const snapshot = buildFailureSnapshot(invoice.intent);

  try {
    await audit({
      actorId: null,
      businessId,
      action: "subscription.intent_activation_failed",
      target: invoice.id,
      meta: {
        invoice: invoice.number,
        reason,
        message: message ?? null,
        amount: invoice.amount,
        subscription_id: invoice.subscription_id,
      },
    });
  } catch (err) {
    console.error(
      "[subscription.applyInvoiceIntent] audit insert failed invoice=%s reason=%s: %s",
      invoice.id,
      reason,
      err instanceof Error ? err.message : String(err)
    );
  }

  // Upsert — partial unique index (invoice_id, reason) WHERE status='pending'
  // menggabungkan retry berulang dengan reason sama jadi satu baris antrean.
  const { error } = await db.from("subscription_intent_failures").upsert(
    {
      business_id: businessId,
      invoice_id: invoice.id,
      subscription_id: invoice.subscription_id,
      reason,
      message: message ?? null,
      intent_snapshot: snapshot,
      amount: invoice.amount,
      status: "pending",
    },
    { onConflict: "invoice_id,reason", ignoreDuplicates: true }
  );
  if (error) {
    console.error(
      "[subscription.applyInvoiceIntent] failure record insert failed invoice=%s reason=%s: %s",
      invoice.id,
      reason,
      error.message
    );
  }
}

/**
 * Best-effort: tandai baris antrean pending invoice ini sebagai dismissed
 * saat aktivasi akhirnya SUKSES (mis. admin un-cancel lalu retry/webhook
 * berikutnya berhasil). Tanpa ini antrean menumpuk tiket basi yang sudah
 * sembuh sendiri. Tidak pernah throw — kegagalan di sini tidak boleh
 * membatalkan aktivasi yang sudah sukses.
 */
async function autoDismissResolvedFailures(db: IntentDb, invoiceId: string): Promise<void> {
  try {
    await db
      .from("subscription_intent_failures")
      .update({
        status: "dismissed",
        resolved_at: new Date().toISOString(),
        resolution_note: "auto-dismissed: retry aktivasi berikutnya sukses",
      })
      .eq("invoice_id", invoiceId)
      .eq("status", "pending");
  } catch (err) {
    console.error(
      "[subscription.applyInvoiceIntent] auto-dismiss failed invoice=%s: %s",
      invoiceId,
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ---------------------------------------------------------------------------
// Main entry — dipanggil adaptor server dengan deps nyata,
// dan test dengan fake in-memory.
// ---------------------------------------------------------------------------

/**
 * Terapkan intent invoice yang sudah dibayar — plan/add-on langsung aktif
 * otomatis (payment-first, docs/02). Idempotent penuh via klaim atomik
 * `intent.applied`: sukses path MEMBIARKAN `applied=true` selamanya
 * (jangan ubah semantik ini).
 *
 * Return void di semua path (sukses maupun failure tercatat). Hanya
 * me-throw untuk INTENT_EXCEPTION setelah failure tercatat + klaim
 * dilepas — pemanggil (webhook) sudah menangani retry berikutnya.
 */
export async function applyInvoiceIntentWithDeps(
  deps: ApplyIntentDeps,
  businessId: string,
  invoiceId: string
): Promise<void> {
  const { db, audit } = deps;
  const { data } = await db
    .from("invoices")
    .select("id, number, subscription_id, amount, intent, status")
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .maybeSingle();
  const invoice = (data ?? null) as {
    id: string;
    number: string;
    subscription_id: string | null;
    amount: number;
    intent: IntentShape;
    status: string;
  } | null;
  // No-op yang sah (BUKAN silent failure):
  // - invoice hilang: caller ID salah, tidak ada yang bisa diaktivasi.
  // - intent null: invoice manual tanpa plan/add-on.
  // - status != paid: dipanggil sebelum settlement; markInvoicePaid akan
  //   panggil ulang setelah payment confirm.
  if (!invoice || !invoice.intent || invoice.status !== "paid") return;
  const items = intentToItems(invoice.intent, invoice.amount);
  if (items.length === 0) return;

  // Klaim sekali-jalan: hanya satu pemanggil menembus update ini.
  const { data: claimed } = await db
    .from("invoices")
    .update({ intent: { ...invoice.intent, applied: true } })
    .eq("id", invoiceId)
    .or("intent->>applied.is.null,intent->>applied.neq.true")
    .select("id")
    .maybeSingle();
  if (!claimed) return; // sudah diterapkan (atau sedang diterapkan pemanggil lain).

  try {
    const planItem = [...items].reverse().find((i) => i.type === "plan_change" && i.plan_id);
    if (planItem) {
      const { data: currentSub } = await db
        .from("subscriptions")
        .select("id, plan_id, current_period_end")
        .eq("id", invoice.subscription_id ?? "")
        .in("status", ["trial", "active", "past_due", "expired"])
        .maybeSingle();
      const currentSubRow = (currentSub ?? null) as {
        id: string;
        plan_id: string | null;
        status: string;
        current_period_end: string | null;
      } | null;
      if (!currentSubRow) {
        // Kasus klasik docs/02 §2.4b: owner cancel → cron flip ke
        // cancelled → webhook paid tiba terlambat. Uang di invoice,
        // plan tak bisa aktif tanpa keputusan manusia (refund/aktivasi).
        // `expired` DIKECUALIKAN — recovery self-service (docs/02 §2.4).
        await recordActivationFailure(deps, {
          businessId,
          invoice,
          reason: INTENT_FAILURE_REASON.SUBSCRIPTION_NOT_ACTIVE,
          message: `Subscription ${invoice.subscription_id ?? "(none)"} bukan trial/active/past_due/expired saat aktivasi plan ${planItem.code ?? planItem.plan_id}`,
        });
        return;
      }

      const isActualPlanChange = currentSubRow.plan_id !== planItem.plan_id;
      // Idempotensi: bila plan sudah sama, status masih 'active' DAN periode
      // masih aktif ke depan, plan ini sudah di-apply pada percobaan sebelumnya
      // (retry pasca partial failure) → SKIP update agar periode tidak
      // di-extend dua kali. Khusus 'active': past_due/expired dengan plan sama
      // adalah renewal sah yang TETAP extend (jangan di-skip).
      const periodEndMs = currentSubRow.current_period_end
        ? new Date(currentSubRow.current_period_end).getTime()
        : NaN;
      const nowMs = Date.now();
      const alreadyApplied =
        !isActualPlanChange &&
        currentSubRow.status === "active" &&
        Number.isFinite(periodEndMs) &&
        periodEndMs > nowMs;

      let period: { start: Date; end: Date } | null = null;
      if (isActualPlanChange) {
        // Plan beda (atau recovery: invoice recovery memakai plan_id baru)
        // → periode baru penuh dari now().
        period = nextPeriod(new Date());
      } else if (!alreadyApplied) {
        const periodEnd = Number.isFinite(periodEndMs) ? new Date(periodEndMs) : null;
        const base = periodEnd && periodEnd.getTime() > nowMs ? periodEnd : new Date(nowMs);
        // Sub expired → periodEnd lampau → base = now: periode baru dari
        // now(), BUKAN extend dari periode yang sudah mati (docs/02 §2.4).
        period = nextPeriod(base);
      }

      if (period) {
        const { data: sub } = await db
          .from("subscriptions")
          .update({
            plan_id: planItem.plan_id,
            status: "active",
            cancel_at_period_end: false,
            current_period_start: period.start.toISOString(),
            current_period_end: period.end.toISOString(),
          })
          .eq("id", currentSubRow.id)
          .in("status", ["trial", "active", "past_due", "expired"])
          .select("id")
          .maybeSingle();
        if (!sub) {
          // Race: lolos SELECT tapi status berubah sebelum UPDATE
          // (cron/admin). Dibedakan dari SUBSCRIPTION_NOT_ACTIVE agar
          // ops bisa membedakan di antrean.
          await recordActivationFailure(deps, {
            businessId,
            invoice,
            reason: INTENT_FAILURE_REASON.UPDATE_NO_ROW,
            message: `subscriptions UPDATE returned 0 rows for id=${currentSubRow.id} (status changed between SELECT and UPDATE)`,
          });
          return;
        }
        await audit({
          actorId: null,
          businessId,
          action: "subscription.plan_activated",
          target: (sub as { id: string }).id,
          meta: { plan: planItem.code, invoice: invoice.number },
        });
        if (deps.notifyPlanActivated) {
          try {
            await deps.notifyPlanActivated({
              businessId,
              invoiceId: invoice.id,
              planName: planItem.name ?? planItem.code ?? "",
            });
          } catch (err) {
            // Best-effort: email gagal tidak boleh membatalkan aktivasi.
            console.error(
              "[subscription.applyInvoiceIntent] notifyPlanActivated failed invoice=%s: %s",
              invoice.id,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
      }
    }

    const addOnItems = items.filter((i) => i.type === "add_on" && i.add_on_id);
    if (addOnItems.length > 0 && !invoice.subscription_id) {
      await recordActivationFailure(deps, {
        businessId,
        invoice,
        reason: INTENT_FAILURE_REASON.MISSING_SUBSCRIPTION_ID,
        message: `Invoice ${invoice.number} berisi ${addOnItems.length} add-on tapi subscription_id null`,
      });
      return;
    }

    if (invoice.subscription_id) {
      for (const item of addOnItems) {
        if (!item.add_on_id) continue;
        const qty = item.qty || 1;
        const { data: existing } = await db
          .from("subscription_add_ons")
          .select("id, quantity")
          .eq("subscription_id", invoice.subscription_id)
          .eq("add_on_id", item.add_on_id)
          .maybeSingle();
        const existingRow = (existing ?? null) as {
          id: string;
          quantity: number;
        } | null;

        if (existingRow) {
          const { error } = await db
            .from("subscription_add_ons")
            .update({ quantity: existingRow.quantity + qty, status: "active" })
            .eq("id", existingRow.id);
          if (error) throw new ApiError("INTERNAL", "Gagal mengaktifkan add-on");
        } else {
          const { error } = await db.from("subscription_add_ons").insert({
            subscription_id: invoice.subscription_id,
            add_on_id: item.add_on_id,
            quantity: qty,
            status: "active",
          });
          if (error) throw new ApiError("INTERNAL", "Gagal mengaktifkan add-on");
        }
        await audit({
          actorId: null,
          businessId,
          action: "subscription.add_on_activated",
          target: invoice.subscription_id,
          meta: { add_on: item.code, quantity: qty, invoice: invoice.number },
        });
      }
    }

    // Template premium (docs/15 §15.9b): tulis kepemilikan agar template global
    // premium tampil & bisa dipakai tenant. Idempotent via unique
    // (business_id, template_id) — onConflict do nothing.
    const templateItems = items.filter((i) => i.type === "template_purchase" && i.template_id);
    for (const item of templateItems) {
      if (!item.template_id) continue;
      const { error: purchaseErr } = await db.from("business_template_purchases").upsert(
        {
          business_id: businessId,
          template_id: item.template_id,
          invoice_id: invoice.id,
          price: item.amount * (item.qty || 1),
          purchased_by: null,
        },
        { onConflict: "business_id,template_id", ignoreDuplicates: true }
      );
      if (purchaseErr) {
        throw new ApiError("INTERNAL", "Gagal menyimpan pembelian template");
      }
      await audit({
        actorId: null,
        businessId,
        action: "template.purchased",
        target: item.template_id,
        meta: {
          template: item.name ?? item.template_id,
          price: item.amount,
          invoice: invoice.number,
        },
      });
    }

    // Sukses penuh — tutup tiket basi bila retry ini menyembuhkan
    // kegagalan sebelumnya (best-effort, tidak throw).
    await autoDismissResolvedFailures(db, invoice.id);
  } catch (error) {
    // Throw tak terduga — klaim dilepas (retry aman) DAN kegagalan
    // tercatat (dulu hanya dilepas lalu rethrow: invisible di antrean).
    await recordActivationFailure(deps, {
      businessId,
      invoice,
      reason: INTENT_FAILURE_REASON.INTENT_EXCEPTION,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
