/**
 * Transaction management — docs/04 §4.5, docs/08 §8.9.
 * List/filter/search server-side + detail + catat manual (payment_method
 * 'manual', non-withdrawable — transaksi manual/offline (bukan pembayaran gateway).
 * Backend = source of truth: final_amount dihitung server (gross − discount).
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { insertAudit } from "@/server/audit";
import {
  todayISO,
  formatTxNumber,
  dateFieldsSchema,
  rangeBoundariesTz,
} from "@/lib/dashboard-math";
import { resolveRange } from "@/server/dashboard";
import { likePattern } from "@/lib/postgrest-search";
import {
  manualTransactionSchema,
  transactionListQuerySchema,
  type ManualTransactionInput,
} from "@/lib/validators";

const COLUMNS = `id, number, status, payment_method, gross_amount, discount_amount, final_amount,
  paid_at, created_at, customer_id, package_id, outlet_id, photobox_id, session_id, voucher_id,
  pos_order_id, withdrawable,
  customers ( name ), packages ( name ), outlets ( name ), photoboxes ( name )`;

type JoinName = { name: string } | { name: string }[] | null;

export type TransactionRow = {
  id: string;
  number: string;
  status: string;
  payment_method: string;
  gross_amount: number;
  discount_amount: number;
  final_amount: number;
  paid_at: string | null;
  created_at: string;
  customer_name: string | null;
  package_name: string | null;
  outlet_name: string | null;
  photobox_name: string | null;
  session_id: string | null;
  voucher_id: string | null;
  pos_order_id: string | null;
  /** false = non-withdrawable (manual/offline). */
  withdrawable: boolean;
};

function mapRow(row: unknown): TransactionRow {
  const r = row as {
    id: string; number: string; status: string; payment_method: string;
    gross_amount: number; discount_amount: number; final_amount: number;
    paid_at: string | null; created_at: string; customer_id: string | null;
    package_id: string | null; outlet_id: string; photobox_id: string;
    session_id: string | null; voucher_id: string | null;
    pos_order_id: string | null; withdrawable: boolean | null;
    customers?: JoinName; packages?: JoinName; outlets?: JoinName; photoboxes?: JoinName;
  };
  const name = (j?: JoinName) => (j && !Array.isArray(j) ? j.name : null);
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    payment_method: r.payment_method,
    gross_amount: r.gross_amount,
    discount_amount: r.discount_amount,
    final_amount: r.final_amount,
    paid_at: r.paid_at,
    created_at: r.created_at,
    customer_name: name(r.customers),
    package_name: name(r.packages),
    outlet_name: name(r.outlets),
    photobox_name: name(r.photoboxes),
    session_id: r.session_id,
    voucher_id: r.voucher_id,
    pos_order_id: r.pos_order_id,
    // Row lama sebelum migrasi 0033 → null → anggap withdrawable (QRIS era lama).
    withdrawable: r.withdrawable ?? true,
  };
}

async function requireTxRead(userId: string, businessId: string, write = false) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "transaction:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses data transaksi");
  }
  if (write && !can(membership.role, "transaction:manual-create")) {
    throw new ApiError("FORBIDDEN", "Hanya owner yang dapat mencatat transaksi manual");
  }
  return membership;
}

export async function listTransactions(
  userId: string,
  businessId: string,
  query: unknown
): Promise<{
  rows: TransactionRow[];
  page: number;
  limit: number;
  total: number;
  range: { from: string; to: string };
}> {
  await requireTxRead(userId, businessId);
  // Query URL bebas diketik/di-bookmark. `transactionListQuerySchema` sudah
  // `.catch()` tiap field, jadi nilai rusak dibuang — bukan ZodError. Yang masih
  // bisa gagal hanya bentuk non-objek (`searchParams` selalu objek, tapi jaga-jaga);
  // jalur itu jatuh ke default (`page` 1, `limit` 20), bukan error boundary.
  const parsed =
    transactionListQuerySchema.safeParse(query).data ??
    transactionListQuerySchema.parse({});
  // `parsed` sudah lolos `isoDate`, jadi parse kedua ini tidak akan melempar —
  // dipertahankan sebagai dokumentasi tipe (DateRangeFields) untuk `resolveRange`.
  const dates = dateFieldsSchema.parse(parsed);
  const { range } = await resolveRange(userId, businessId, dates);

  const { startMs, endMs } = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const fromIso = new Date(startMs).toISOString();
  const toIso = new Date(endMs).toISOString();

  const supabase = createServerClient();
  let req = supabase
    .from("transactions")
    .select(COLUMNS, { count: "exact" })
    .eq("business_id", businessId)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .range((parsed.page - 1) * parsed.limit, parsed.page * parsed.limit - 1);

  if (parsed.status) req = req.eq("status", parsed.status);
  if (parsed.outlet) req = req.eq("outlet_id", parsed.outlet);
  if (parsed.photobox) req = req.eq("photobox_id", parsed.photobox);
  if (parsed.package) req = req.eq("package_id", parsed.package);
  if (parsed.method) req = req.eq("payment_method", parsed.method);
  if (parsed.source === "pos") req = req.not("pos_order_id", "is", null);
  if (parsed.source === "kiosk") req = req.is("pos_order_id", null);

  if (parsed.q) {
    const like = likePattern(parsed.q);
    const { data: matched } = await supabase
      .from("customers")
      .select("id")
      .eq("business_id", businessId)
      .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .limit(100);
    const ids = (matched ?? []).map((c) => c.id);
    const parts = [`number.ilike.${like}`];
    if (ids.length > 0) parts.push(`customer_id.in.(${ids.join(",")})`);
    req = req.or(parts.join(","));
  }

  const { data, count, error } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat transaksi");
  return {
    rows: (data ?? []).map(mapRow),
    page: parsed.page,
    limit: parsed.limit,
    total: count ?? 0,
    range: { from: range.from, to: range.to },
  };
}

async function assertOwned(
  businessId: string,
  table: "outlets" | "photoboxes" | "packages",
  id: string
) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) {
    throw new ApiError("VALIDATION_ERROR", `${table} tidak ditemukan di business ini`, {
      [table === "packages" ? "package_id" : `${table.slice(0, -1)}_id`]: ["Tidak valid"],
    });
  }
}

/** Catat transaksi manual owner — langsung `paid`, NON-withdrawable. */
export async function createManualTransaction(
  userId: string,
  businessId: string,
  input: ManualTransactionInput
) {
  const parsed = manualTransactionSchema.parse(input);
  await requireTxRead(userId, businessId, true);

  if (parsed.discount_amount > parsed.gross_amount) {
    throw new ApiError("VALIDATION_ERROR", "Diskon tidak boleh melebihi gross", {
      discount_amount: ["Diskon melebihi gross amount"],
    });
  }
  await assertOwned(businessId, "outlets", parsed.outlet_id);
  await assertOwned(businessId, "photoboxes", parsed.photobox_id);
  if (parsed.package_id) await assertOwned(businessId, "packages", parsed.package_id);

  const supabase = createServerClient();
  const membership = await getMembership(userId, businessId);
  const tz = membership?.business.timezone ?? "Asia/Jakarta";
  const number = formatTxNumber(todayISO(tz), randomUUID().replace(/-/g, "").slice(0, 6));

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      business_id: businessId,
      outlet_id: parsed.outlet_id,
      photobox_id: parsed.photobox_id,
      package_id: parsed.package_id ?? null,
      // Selalu 'manual' + non-withdrawable: tidak ada row payments (reporting saja).
      payment_method: "manual",
      withdrawable: false,
      gross_amount: parsed.gross_amount,
      discount_amount: parsed.discount_amount,
      final_amount: parsed.gross_amount - parsed.discount_amount,
      status: "paid",
      number,
      paid_at: new Date().toISOString(),
    })
    .select("id, number, final_amount, status")
    .single();
  if (error) throw new ApiError("INTERNAL", "Gagal mencatat transaksi");
  await insertAudit({
    actorId: userId,
    businessId,
    action: "transaction.manual_create",
    target: data.id,
    meta: { number: data.number, method: parsed.payment_method, amount: data.final_amount },
  });
  return data;
}
