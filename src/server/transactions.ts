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
import { signedUrlMap } from "@/server/storage";
import { listAssignedPhotoboxIds } from "@/server/staff";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/constants";
import {
  manualTransactionSchema,
  transactionListQuerySchema,
  type ManualTransactionInput,
} from "@/lib/validators";

const GENERATED_BUCKET = "generated-photos" as const;

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
  /** Token halaman hasil `/r/[token]` — null untuk transaksi tanpa sesi foto. */
  result_token: string | null;
  /** Batas simpan hasil foto (finalized_at + retention_days). */
  expires_at: string | null;
  /** Sisa hari sampai hasil kedaluwarsa; 0 = sudah kedaluwarsa. */
  days_left: number | null;
  /** false = non-withdrawable (manual/offline). */
  withdrawable: boolean;
};

function mapRow(row: unknown): TransactionRow {
  const r = row as {
    id: string;
    number: string;
    status: string;
    payment_method: string;
    gross_amount: number;
    discount_amount: number;
    final_amount: number;
    paid_at: string | null;
    created_at: string;
    customer_id: string | null;
    package_id: string | null;
    outlet_id: string;
    photobox_id: string;
    session_id: string | null;
    voucher_id: string | null;
    pos_order_id: string | null;
    withdrawable: boolean | null;
    customers?: JoinName;
    packages?: JoinName;
    outlets?: JoinName;
    photoboxes?: JoinName;
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
    result_token: null,
    expires_at: null,
    days_left: null,
    // Row lama sebelum migrasi 0033 → null → anggap withdrawable (QRIS era lama).
    withdrawable: r.withdrawable ?? true,
  };
}

/**
 * Lengkapi `result_token` + masa simpan hasil (batch, bukan N+1).
 * Masa simpan = `sessions.finalized_at` + `business_settings.retention_days`.
 */
async function attachResultMeta(
  businessId: string,
  rows: TransactionRow[]
): Promise<TransactionRow[]> {
  const sessionIds = Array.from(
    new Set(rows.map((r) => r.session_id).filter((id): id is string => Boolean(id)))
  );
  if (sessionIds.length === 0) return rows;
  const supabase = createServerClient();
  const [{ data: checkouts }, { data: sessions }, { data: settings }] = await Promise.all([
    supabase.from("checkout_sessions").select("session_id, result_token").in("session_id", sessionIds),
    supabase.from("sessions").select("id, finalized_at").in("id", sessionIds),
    supabase
      .from("business_settings")
      .select("retention_days")
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);
  const tokenBySession = new Map(
    (checkouts ?? []).map((row: { session_id: string | null; result_token: string | null }) => [
      row.session_id,
      row.result_token,
    ])
  );
  const finalizedBySession = new Map(
    (sessions ?? []).map((row: { id: string; finalized_at: string | null }) => [
      row.id,
      row.finalized_at,
    ])
  );
  const retentionDays =
    (settings as { retention_days: number | null } | null)?.retention_days ?? 3;
  const now = Date.now();

  return rows.map((row) => {
    if (!row.session_id) return row;
    const finalizedAt = finalizedBySession.get(row.session_id);
    const finalizedMs = finalizedAt ? Date.parse(finalizedAt) : NaN;
    if (!Number.isFinite(finalizedMs)) {
      return { ...row, result_token: tokenBySession.get(row.session_id) ?? null };
    }
    const expiresMs = finalizedMs + retentionDays * 24 * 60 * 60 * 1000;
    return {
      ...row,
      result_token: tokenBySession.get(row.session_id) ?? null,
      expires_at: new Date(expiresMs).toISOString(),
      days_left: Math.max(0, Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000))),
    };
  });
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
    transactionListQuerySchema.safeParse(query).data ?? transactionListQuerySchema.parse({});
  // `parsed` sudah lolos `isoDate`, jadi parse kedua ini tidak akan melempar —
  // dipertahankan sebagai dokumentasi tipe (DateRangeFields) untuk `resolveRange`.
  const dates = dateFieldsSchema.parse(parsed);
  const { range } = await resolveRange(userId, businessId, dates);
  return fetchTransactionPage(businessId, parsed, range, null);
}

type TxListQuery = ReturnType<typeof transactionListQuerySchema.parse>;
type TxPage = {
  rows: TransactionRow[];
  page: number;
  limit: number;
  total: number;
  range: { from: string; to: string };
};

/** Query bersama owner & staff. `restrictTo` = booth yang boleh dilihat staff. */
async function fetchTransactionPage(
  businessId: string,
  parsed: TxListQuery,
  range: { from: string; to: string; timeZone: string },
  restrictTo: string[] | null
): Promise<TxPage> {
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

  if (restrictTo) {
    if (restrictTo.length === 0) {
      return { rows: [], page: parsed.page, limit: parsed.limit, total: 0, range };
    }
    req = req.in("photobox_id", restrictTo);
  }
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
    rows: await attachResultMeta(businessId, (data ?? []).map(mapRow)),
    page: parsed.page,
    limit: parsed.limit,
    total: count ?? 0,
    range: { from: range.from, to: range.to },
  };
}

/**
 * Daftar transaksi untuk shell staff — read-only, dibatasi booth yang
 * di-assign ke user (member_photoboxes). Tanpa permission finansial penuh.
 */
export async function listStaffTransactions(
  userId: string,
  businessId: string,
  query: unknown
): Promise<TxPage> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "transaction:track")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses tracking transaksi");
  }
  const parsed =
    transactionListQuerySchema.safeParse(query).data ?? transactionListQuerySchema.parse({});
  const dates = dateFieldsSchema.parse(parsed);
  const { range } = await resolveRange(userId, businessId, dates);
  const restrictTo = await listAssignedPhotoboxIds(userId, businessId);
  return fetchTransactionPage(businessId, parsed, range, restrictTo);
}

export type TransactionPhoto = { id: string; url: string | null; order_index: number };

/** Detail satu transaksi + URL foto hasil (signed, bucket privat). */
export async function getTransactionDetail(userId: string, businessId: string, id: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  const fullAccess = can(membership.role, "transaction:read");
  if (!fullAccess && !can(membership.role, "transaction:track")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses data transaksi");
  }
  const restrictTo = fullAccess ? null : await listAssignedPhotoboxIds(userId, businessId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(COLUMNS)
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat transaksi");
  if (!data) throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan");
  if (restrictTo && !restrictTo.includes((data as { photobox_id: string }).photobox_id)) {
    throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan");
  }

  const row = (await attachResultMeta(businessId, [mapRow(data)]))[0]!;
  let photos: TransactionPhoto[] = [];
  let gifUrl: string | null = null;

  if (row.session_id) {
    const [{ data: photoRows }, { data: session }] = await Promise.all([
      supabase
        .from("photos")
        .select("id, file_key, order_index")
        .eq("session_id", row.session_id)
        .eq("business_id", businessId)
        .order("order_index", { ascending: true }),
      supabase
        .from("sessions")
        .select("result_gif_key")
        .eq("id", row.session_id)
        .eq("business_id", businessId)
        .maybeSingle(),
    ]);
    const rows = (photoRows ?? []) as { id: string; file_key: string; order_index: number }[];
    const gifKey = (session as { result_gif_key: string | null } | null)?.result_gif_key ?? null;
    const keys = [...rows.map((p) => p.file_key), ...(gifKey ? [gifKey] : [])];
    const urlMap = await signedUrlMap(GENERATED_BUCKET, keys, SIGNED_URL_TTL_SECONDS);
    photos = rows.map((p) => ({
      id: p.id,
      url: urlMap.get(p.file_key) ?? null,
      order_index: p.order_index,
    }));
    gifUrl = gifKey ? (urlMap.get(gifKey) ?? null) : null;
  }

  return { ...row, photos, gif_url: gifUrl };
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

/** Booth wajib berada di outlet yang dicatat transaksi — cegah baris lintas
 *  outlet (`transactions.outlet_id` dipakai laporan per lokasi). */
async function assertBoothInOutlet(businessId: string, outletId: string, photoboxId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("photoboxes")
    .select("id, outlet_id")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) {
    throw new ApiError("VALIDATION_ERROR", "photoboxes tidak ditemukan di business ini", {
      photobox_id: ["Tidak valid"],
    });
  }
  if ((data as { outlet_id: string }).outlet_id !== outletId) {
    throw new ApiError("VALIDATION_ERROR", "Photobox tidak berada di outlet yang dipilih", {
      photobox_id: ["Photobox beda outlet"],
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
  await assertBoothInOutlet(businessId, parsed.outlet_id, parsed.photobox_id);
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
