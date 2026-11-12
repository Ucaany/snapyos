/**
 * Subscription invoice intent activation — core logic (docs/02 §2.4b).
 *
 * Modul ini PURE-ish: tanpa `server-only`, tanpa import `@/...`, tanpa
 * `next/*` — supaya bisa di-test terpisah. Konsumen produksi adalah
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
  /**
   * Renewal/pemulihan plan (docs/02 §2.4): periode BARU dari now(),
   * bukan extend dari current_period_end lama. Dipakai jalur renewal
   * self-service (past_due/expired) yang tetap memuat plan_change.
   */
  new_period?: boolean;
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
  /**
   * Progres add-on idempotent: indeks item (dalam `items`) yang sudah
   * berhasil diterapkan. Ditulis setelah tiap item sukses agar retry pasca
   * partial failure tidak menggandakan add-on.
   */
  applied_items?: number[];
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
  LATE_PAYMENT_VOID_INVOICE: "LATE_PAYMENT_VOID_INVOICE",
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
export type IntentDbError = { message: string; code?: string } | null;

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

/**
 * Tulis (atau perbarui) SATU tiket pending untuk (invoice_id, reason).
 *
 * Partial unique index `(invoice_id, reason) WHERE status='pending'` meng-
 * gabungkan retry berulang reason sama jadi satu tiket; retry reason berbeda
 * membuat tiket terpisah. Upsert dengan `onConflict: "invoice_id,reason"`
 * TIDAK BISA dipakai di sini — PostgREST gagal meng-infer target partial
 * unique index (butuh predicate `WHERE status='pending'`). Karena itu:
 *   1. select tiket pending yang cocok → UPDATE bila ada,
 *   2. kalau tidak ada → INSERT,
 *   3. bila INSERT kena unique violation 23505 (race dua request) → select
 *      ulang + UPDATE sekali.
 * Kegagalan tulis TIDAK pernah ditelan diam-diam: di-log (audit sudah
 * ditulis pemanggil sebelum ini).
 */
async function upsertPendingFailure(
  db: IntentDb,
  row: {
    business_id: string;
    invoice_id: string;
    subscription_id: string | null;
    reason: string;
    message: string | null;
    intent_snapshot: Record<string, unknown>;
    amount: number;
  }
): Promise<void> {
  const patch = {
    business_id: row.business_id,
    subscription_id: row.subscription_id,
    message: row.message,
    intent_snapshot: row.intent_snapshot,
    amount: row.amount,
  };
  const { data: existing } = await db
    .from("subscription_intent_failures")
    .select("id")
    .eq("invoice_id", row.invoice_id)
    .eq("reason", row.reason)
    .eq("status", "pending")
    .maybeSingle();
  const existingRow = (existing ?? null) as { id?: string } | null;
  if (existingRow?.id) {
    const { error } = await db
      .from("subscription_intent_failures")
      .update(patch)
      .eq("id", existingRow.id);
    if (error) {
      console.error(
        "[subscription.applyInvoiceIntent] failure ticket update failed invoice=%s reason=%s: %s",
        row.invoice_id,
        row.reason,
        error.message
      );
    }
    return;
  }

  const { error } = await db.from("subscription_intent_failures").insert({
    ...row,
    status: "pending",
  });
  if (!error) return;
  if (error.code === "23505") {
    // Race: baris pending muncul di sela select→insert. Retry update sekali.
    const { data: raced } = await db
      .from("subscription_intent_failures")
      .select("id")
      .eq("invoice_id", row.invoice_id)
      .eq("reason", row.reason)
      .eq("status", "pending")
      .maybeSingle();
    const racedRow = (raced ?? null) as { id?: string } | null;
    if (racedRow?.id) {
      const { error: retryError } = await db
        .from("subscription_intent_failures")
        .update(patch)
        .eq("id", racedRow.id);
      if (retryError) {
        console.error(
          "[subscription.applyInvoiceIntent] failure ticket retry-update failed invoice=%s reason=%s: %s",
          row.invoice_id,
          row.reason,
          retryError.message
        );
      }
      return;
    }
  }
  console.error(
    "[subscription.applyInvoiceIntent] failure ticket insert failed invoice=%s reason=%s: %s",
    row.invoice_id,
    row.reason,
    error.message
  );
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

  // Partial unique index (invoice_id, reason) WHERE status='pending' meng-
  // gabungkan retry berulang reason sama jadi satu baris antrean.
  await upsertPendingFailure(db, {
    business_id: businessId,
    invoice_id: invoice.id,
    subscription_id: invoice.subscription_id,
    reason,
    message: message ?? null,
    intent_snapshot: snapshot,
    amount: invoice.amount,
  });
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

/**
 * Late payment pada invoice `void` (docs/02 §2.4b): uang settled untuk invoice
 * yang sudah dibatalkan (void) — TIDAK boleh auto-reactivate. Invoice tetap
 * `void` (uang wajib direview/direfund manusia). Catat jejak audit + tiket
 * manual agar tidak hilang diam-diam. Return void; pemanggil (webhook) tetap
 * membalas ok.
 */
export async function recordLatePaymentVoidInvoice(
  deps: ApplyIntentDeps,
  args: {
    businessId: string;
    invoiceId: string;
    subscriptionId: string | null;
    amount: number;
    number?: string | null;
    intent: IntentShape;
  }
): Promise<void> {
  const { db, audit } = deps;
  const snapshot = buildFailureSnapshot(args.intent);
  try {
    await audit({
      actorId: null,
      businessId: args.businessId,
      action: "subscription.late_payment_void_invoice",
      target: args.invoiceId,
      meta: {
        invoice: args.number ?? null,
        reason: INTENT_FAILURE_REASON.LATE_PAYMENT_VOID_INVOICE,
        amount: args.amount,
        subscription_id: args.subscriptionId,
      },
    });
  } catch (err) {
    console.error(
      "[subscription.applyInvoiceIntent] late-payment audit failed invoice=%s: %s",
      args.invoiceId,
      err instanceof Error ? err.message : String(err)
    );
  }
  await upsertPendingFailure(db, {
    business_id: args.businessId,
    invoice_id: args.invoiceId,
    subscription_id: args.subscriptionId,
    reason: INTENT_FAILURE_REASON.LATE_PAYMENT_VOID_INVOICE,
    message:
      "Pembayaran diterima untuk invoice yang sudah dibatalkan (void) — perlu review/refund manual.",
    intent_snapshot: snapshot,
    amount: args.amount,
  });
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

  // Progres add-on idempotent (retry pasca partial failure): indeks item yang
  // sudah sukses disimpan di intent.applied_items dan dilewati saat retry.
  const appliedItems = new Set<number>(
    Array.isArray(invoice.intent.applied_items)
      ? invoice.intent.applied_items.filter((n) => Number.isInteger(n))
      : []
  );
  const claimedIntent: IntentShape = { ...invoice.intent, applied: true };
  // Simpan referensi ke invoice agar release-claim (buildReleasedIntent) saat
  // failure TETAP membawa applied_items terbaru (bukan snapshot lama).
  invoice.intent = claimedIntent;

  const persistProgress = async (): Promise<void> => {
    claimedIntent.applied_items = [...appliedItems].sort((a, b) => a - b);
    const { error } = await db
      .from("invoices")
      .update({ intent: claimedIntent })
      .eq("id", invoiceId)
      .eq("intent->>applied", "true");
    if (error) {
      console.error(
        "[subscription.applyInvoiceIntent] progress write failed invoice=%s: %s",
        invoiceId,
        error.message
      );
    }
  };

  try {
    const planItem = [...items].reverse().find((i) => i.type === "plan_change" && i.plan_id);
    const addOnItems = items
      .map((item, index) => ({ item, index }))
      .filter((e) => e.item.type === "add_on" && e.item.add_on_id);

    // Add-on tanpa subscription_id → tiket terpisah (bukan SUBSCRIPTION_NOT_ACTIVE).
    if (addOnItems.length > 0 && !invoice.subscription_id) {
      await recordActivationFailure(deps, {
        businessId,
        invoice,
        reason: INTENT_FAILURE_REASON.MISSING_SUBSCRIPTION_ID,
        message: `Invoice ${invoice.number} berisi ${addOnItems.length} add-on tapi subscription_id null`,
      });
      return;
    }

    // Gate status subscription untuk SETIAP invoice yang butuh subscription
    // (plan_change ATAU add_on). Sebelumnya gate ini hanya di dalam blok
    // planItem → invoice add-on-only lolos tanpa validasi status.
    const needsSubscription = Boolean(planItem) || addOnItems.length > 0;
    let currentSubRow: {
      id: string;
      plan_id: string | null;
      status: string;
      current_period_end: string | null;
    } | null = null;
    if (needsSubscription) {
      const { data: subSel } = await db
        .from("subscriptions")
        .select("id, plan_id, status, current_period_end")
        .eq("id", invoice.subscription_id ?? "")
        .in("status", ["trial", "active", "past_due", "expired"])
        .maybeSingle();
      currentSubRow = (subSel ?? null) as {
        id: string;
        plan_id: string | null;
        status: string;
        current_period_end: string | null;
      } | null;
      if (!currentSubRow) {
        // Kasus klasik docs/02 §2.4b: owner cancel → cron flip ke
        // cancelled → webhook paid tiba terlambat. Uang di invoice,
        // plan/add-on tak bisa aktif tanpa keputusan manusia (refund/aktivasi).
        // `expired` DIKECUALIKAN — recovery self-service (docs/02 §2.4).
        await recordActivationFailure(deps, {
          businessId,
          invoice,
          reason: INTENT_FAILURE_REASON.SUBSCRIPTION_NOT_ACTIVE,
          message: `Subscription ${invoice.subscription_id ?? "(none)"} bukan trial/active/past_due/expired saat aktivasi${planItem ? ` plan ${planItem.code ?? planItem.plan_id}` : " add-on"}`,
        });
        return;
      }
    }

    if (planItem && currentSubRow) {
      const currentSub = currentSubRow;
      const isActualPlanChange = currentSubRow.plan_id !== planItem.plan_id;
      // Idempotensi: bila plan sudah sama, status masih 'active' DAN periode
      // masih aktif ke depan, plan ini sudah di-apply pada percobaan sebelumnya
      // (retry pasca partial failure) → SKIP update agar periode tidak
      // di-extend dua kali. past_due/expired dengan plan sama adalah renewal
      // sah yang TETAP extend (atau periode baru bila `new_period`).
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
        if (planItem.new_period) {
          // Renewal self-service (past_due/expired): periode BARU dari now(),
          // bukan extend dari periode lama (docs/02 §2.4 recovery semantics).
          period = nextPeriod(new Date());
        } else {
          const periodEnd = Number.isFinite(periodEndMs) ? new Date(periodEndMs) : null;
          const base = periodEnd && periodEnd.getTime() > nowMs ? periodEnd : new Date(nowMs);
          // Sub expired → periodEnd lampau → base = now: periode baru dari
          // now(), BUKAN extend dari periode yang sudah mati (docs/02 §2.4).
          period = nextPeriod(base);
        }
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
          .eq("id", currentSub.id)
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
            message: `subscriptions UPDATE returned 0 rows for id=${currentSub.id} (status changed between SELECT and UPDATE)`,
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

    if (invoice.subscription_id) {
      for (const { item, index } of addOnItems) {
        if (!item.add_on_id) continue;
        // Sudah diterapkan pada percobaan sebelumnya → jangan gandakan.
        // (Juga mencegah increment ganda saat add-on row sudah ada.)
        if (appliedItems.has(index)) continue;
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
          // Re-buy/reactivation add-on WAJIB membatalkan jadwal cancel dan
          // mengaktifkan kembali baris yang mungkin sudah non-aktif.
          const { error } = await db
            .from("subscription_add_ons")
            .update({
              quantity: existingRow.quantity + qty,
              status: "active",
              cancel_at_period_end: false,
            })
            .eq("id", existingRow.id);
          if (error) throw new ApiError("INTERNAL", "Gagal mengaktifkan add-on");
        } else {
          const { error } = await db.from("subscription_add_ons").insert({
            subscription_id: invoice.subscription_id,
            add_on_id: item.add_on_id,
            quantity: qty,
            status: "active",
            cancel_at_period_end: false,
          });
          if (error) throw new ApiError("INTERNAL", "Gagal mengaktifkan add-on");
        }
        appliedItems.add(index);
        await persistProgress();
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
