/**
 * Admin — Subscription intent activation failures queue.
 *
 * Pair with:
 *   - db/migrations/0041_subscription_intent_failures.sql (table definition)
 *   - src/server/subscription.ts::applyInvoiceIntent  (writer)
 *   - src/app/(admin)/admin/subscriptions/pending-review/page.tsx (UI)
 *
 * The queue exists because applyInvoiceIntent can hit a non-error early-return
 * path where the invoice is settled (money captured by provider) but plan or
 * add-on activation fails silently. Each row here is a case that requires a
 * human decision: refund the customer or activate the entitlement by hand.
 *
 * Two resolution actions are exposed:
 *   - `activateManually(failureId, ...)` — the admin has taken corrective
 *     action out-of-band (extended period, attached add-on via existing
 *     admin UI) and is closing the ticket. This writes an audit row and
 *     flips the failure row to `activated`.
 *   - `markRefunded(failureId, ...)` — the admin issued a Pakasir refund
 *     (out-of-band, no API in scope yet) and is closing the ticket.
 *   - `dismiss(failureId, ...)` — false alarm / duplicate / superseded.
 *
 * These actions do NOT retry applyInvoiceIntent — retrying against a
 * cancelled subscription would just re-fail the same way. If the admin
 * wants a retry, they should first unwind the subscription state
 * (e.g., un-cancel) via /admin/subscriptions, then use the existing
 * "Apply intent" flow (out of scope here).
 */

import "server-only";
import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { requireAdmin, audit } from "./guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntentFailureStatus = "pending" | "activated" | "refunded" | "dismissed";

export type AdminIntentFailureRow = {
  id: string;
  business_id: string;
  business_name: string;
  invoice_id: string;
  invoice_number: string;
  subscription_id: string | null;
  reason: string;
  message: string | null;
  intent_snapshot: unknown;
  amount: number;
  status: IntentFailureStatus;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const STATUSES: IntentFailureStatus[] = ["pending", "activated", "refunded", "dismissed"];

function isStatus(v: string | undefined): v is IntentFailureStatus {
  return typeof v === "string" && (STATUSES as string[]).includes(v);
}

/**
 * True bila error PostgREST menandakan offset melewati jumlah baris
 * (PGRST103 / HTTP 416 "Requested range not satisfiable"). Ini bukan kegagalan
 * server — halaman kosong adalah hasil yang benar (mis. deep-link / bookmark).
 * Dijaga identik dengan src/server/admin/users.ts.
 */
function isRangeNotSatisfiable(error: { code?: string; message?: string }): boolean {
  if (String(error.code ?? "") === "PGRST103") return true;
  return /requested range not satisfiable|range not satisfiable/i.test(String(error.message ?? ""));
}

/**
 * List failures with optional status filter (default: pending). Paginated.
 * N+1 avoided by relying on Supabase FK-join select strings.
 */
export async function listIntentFailures(query: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: AdminIntentFailureRow[];
  total: number;
  countsByStatus: Record<IntentFailureStatus, number>;
}> {
  await requireAdmin();
  const status: IntentFailureStatus = isStatus(query.status) ? query.status : "pending";
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 25));

  const supabase = createServerClient();
  let { data, error, count } = await supabase
    .from("subscription_intent_failures")
    .select(
      // Join business name + invoice number + resolver display name so
      // the page renders without follow-up queries per row.
      "id, business_id, invoice_id, subscription_id, reason, message, intent_snapshot, amount, status, resolved_by, resolved_at, resolution_note, created_at, updated_at, businesses ( name ), invoices ( number ), resolver:users!subscription_intent_failures_resolved_by_fkey ( name, email )",
      { count: "exact" }
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // Halaman melampaui jumlah baris → offset tak terjangkau (PGRST103/416).
  // Kembalikan daftar kosong + total sebenarnya, bukan 500.
  if (error && isRangeNotSatisfiable(error)) {
    data = [];
    error = null;
    const recount = await supabase
      .from("subscription_intent_failures")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    count = recount.count ?? 0;
  }
  if (error) {
    throw new ApiError("INTERNAL", `Gagal memuat antrian review: ${error.message}`);
  }

  type JoinedRow = {
    id: string;
    business_id: string;
    invoice_id: string;
    subscription_id: string | null;
    reason: string;
    message: string | null;
    intent_snapshot: unknown;
    amount: number;
    status: IntentFailureStatus;
    resolved_by: string | null;
    resolved_at: string | null;
    resolution_note: string | null;
    created_at: string;
    updated_at: string;
    businesses: { name: string } | { name: string }[] | null;
    invoices: { number: string } | { number: string }[] | null;
    resolver:
      | { name: string | null; email: string | null }
      | { name: string | null; email: string | null }[]
      | null;
  };

  const rows = (data ?? []) as unknown as JoinedRow[];
  const items: AdminIntentFailureRow[] = rows.map((r) => {
    const biz = Array.isArray(r.businesses) ? r.businesses[0] : r.businesses;
    const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
    const rslv = Array.isArray(r.resolver) ? r.resolver[0] : r.resolver;
    return {
      id: r.id,
      business_id: r.business_id,
      business_name: biz?.name ?? "-",
      invoice_id: r.invoice_id,
      invoice_number: inv?.number ?? "-",
      subscription_id: r.subscription_id,
      reason: r.reason,
      message: r.message,
      intent_snapshot: r.intent_snapshot,
      amount: r.amount,
      status: r.status,
      resolved_by: r.resolved_by,
      resolved_by_name: rslv?.name ?? rslv?.email ?? null,
      resolved_at: r.resolved_at,
      resolution_note: r.resolution_note,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  // Cheap status-tab counts (4 queries, all indexed by
  // idx_intent_failures_status). Runs in parallel.
  const [pending, activated, refunded, dismissed] = await Promise.all(
    STATUSES.map((s) =>
      supabase
        .from("subscription_intent_failures")
        .select("id", { count: "exact", head: true })
        .eq("status", s)
        .then(({ count: c }) => c ?? 0)
    )
  );
  const countsByStatus: Record<IntentFailureStatus, number> = {
    // `?? 0` menutup noUncheckedIndexedAccess (destruktur array Promise.all).
    pending: pending ?? 0,
    activated: activated ?? 0,
    refunded: refunded ?? 0,
    dismissed: dismissed ?? 0,
  };

  return { items, total: count ?? 0, countsByStatus };
}

// ---------------------------------------------------------------------------
// Resolutions
// ---------------------------------------------------------------------------

const resolveSchema = z.object({
  failure_id: z.string().uuid("Failure ID tidak valid"),
  note: z
    .string()
    .trim()
    .max(500, "Catatan maksimal 500 karakter")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

async function transitionFailure(input: {
  failureId: string;
  note: string | null;
  next: Exclude<IntentFailureStatus, "pending">;
  auditAction: string;
}) {
  const admin = await requireAdmin();
  const supabase = createServerClient();

  // Load current row for audit context + business_id (needed for owner
  // audit log so the owner sees "admin refunded/activated your case").
  const { data: current, error: loadErr } = await supabase
    .from("subscription_intent_failures")
    .select("id, business_id, invoice_id, reason, status")
    .eq("id", input.failureId)
    .maybeSingle();
  if (loadErr) {
    throw new ApiError("INTERNAL", `Gagal memuat kasus: ${loadErr.message}`);
  }
  if (!current) {
    throw new ApiError("NOT_FOUND", "Kasus tidak ditemukan");
  }
  if (current.status !== "pending") {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Kasus sudah berstatus ${current.status}: tidak bisa diubah lagi`
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("subscription_intent_failures")
    .update({
      status: input.next,
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
      resolution_note: input.note,
    })
    .eq("id", input.failureId)
    // CAS: don't clobber a concurrent resolution.
    .eq("status", "pending")
    .select("id, status")
    .maybeSingle();
  if (updateErr) {
    throw new ApiError("INTERNAL", `Gagal update kasus: ${updateErr.message}`);
  }
  if (!updated) {
    throw new ApiError("VALIDATION_ERROR", "Kasus baru saja diubah admin lain: refresh halaman");
  }

  await audit(
    admin.id,
    input.auditAction,
    input.failureId,
    {
      invoice_id: current.invoice_id,
      reason: current.reason,
      note: input.note,
    },
    current.business_id
  );

  return updated;
}

/**
 * Admin manually activated the entitlement out-of-band (via the standard
 * /admin/subscriptions UI or a direct DB tweak). Marks the queue row
 * `activated` — no automatic re-run of applyInvoiceIntent.
 */
export async function activateManually(input: unknown) {
  const parsed = resolveSchema.parse(input);
  return transitionFailure({
    failureId: parsed.failure_id,
    note: parsed.note,
    next: "activated",
    auditAction: "admin.subscription.intent_failure.activated",
  });
}

/**
 * Admin issued a refund out-of-band. Marks the queue row `refunded`.
 * NOTE: this does not touch the payment / invoice rows — the refund
 * itself is a Pakasir dashboard action. The invoice keeps status='paid'
 * as historical fact; a follow-up adjustment (credit note / reversal)
 * is out of scope for this queue.
 */
export async function markRefunded(input: unknown) {
  const parsed = resolveSchema.parse(input);
  return transitionFailure({
    failureId: parsed.failure_id,
    note: parsed.note,
    next: "refunded",
    auditAction: "admin.subscription.intent_failure.refunded",
  });
}

/**
 * Dismiss a case — false alarm, duplicate, or a later successful retry
 * already fixed it. Marks the queue row `dismissed`.
 */
export async function dismissFailure(input: unknown) {
  const parsed = resolveSchema.parse(input);
  return transitionFailure({
    failureId: parsed.failure_id,
    note: parsed.note,
    next: "dismissed",
    auditAction: "admin.subscription.intent_failure.dismissed",
  });
}
