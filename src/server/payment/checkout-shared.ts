/**
 * Shared types + helpers for checkout modules — docs/05 §5.12, docs/06.
 * Internal only; not re-exported from the barrel.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { computeVoucherDiscount } from "@/lib/checkout-math";
import { resolveActiveDevice } from "@/server/devices";
import { requireFeature } from "@/server/feature-gate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckoutRow = {
  id: string;
  business_id: string;
  outlet_id: string | null;
  photobox_id: string | null;
  package_id: string;
  voucher_id: string | null;
  gross_amount: number;
  discount_amount: number;
  final_amount: number;
  status: string;
  result_token: string | null;
  expires_at: string | null;
};

export type PaymentRow = {
  id: string;
  business_id: string;
  checkout_session_id: string;
  outlet_id: string | null;
  photobox_id: string | null;
  package_id: string | null;
  gross_amount: number;
  discount_amount: number;
  voucher_id: string | null;
  final_amount: number;
  order_id: string;
  amount_uniq: number | null;
  total_amount: number | null;
  provider: string;
  payment_reference: string;
  status: string;
  transaction_id: string | null;
  qr_string: string | null;
  expires_at: string | null;
  credential_id: string | null; // Direct Merchant credential (0027); null = aggregator
  provider_ref: string | null; // Pakasir v2 txn_id (status lookup)
};

export type DeviceCtx = {
  businessId: string;
  businessSlug: string;
  photobox: {
    id: string;
    business_id: string;
    slug: string;
    outlet_id: string;
    camera_settings: unknown;
    print_settings: unknown;
    session_settings: unknown;
    device_status: unknown;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function requireDevice(businessSlug: string, deviceToken: string): Promise<DeviceCtx> {
  const device = await resolveActiveDevice(deviceToken);
  if (device.businessSlug !== businessSlug) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }
  return device as unknown as DeviceCtx;
}

export async function loadCheckout(businessId: string, checkoutId: string): Promise<CheckoutRow> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("checkout_sessions")
    .select("*")
    .eq("id", checkoutId)
    .eq("business_id", businessId)
    .maybeSingle();
  const row = (data ?? null) as unknown as CheckoutRow | null;
  if (!row) throw new ApiError("PAYMENT_NOT_FOUND", "Checkout tidak ditemukan");
  return row;
}

/**
 * Checkout untuk jalur KIOSK: selain milik business, harus milik booth yang
 * memegang device token. Tanpa filter photobox_id, token booth A bisa membuat
 * pembayaran (dan mengubah harga) untuk checkout booth B di tenant yang sama.
 */
export async function loadCheckoutForPhotobox(
  businessId: string,
  photoboxId: string,
  checkoutId: string
): Promise<CheckoutRow> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("checkout_sessions")
    .select("*")
    .eq("id", checkoutId)
    .eq("business_id", businessId)
    .eq("photobox_id", photoboxId)
    .maybeSingle();
  const row = (data ?? null) as unknown as CheckoutRow | null;
  if (!row) throw new ApiError("PAYMENT_NOT_FOUND", "Checkout tidak ditemukan");
  return row;
}

export async function loadPaymentByReference(
  businessId: string,
  paymentReference: string
): Promise<PaymentRow> {
  // Trust boundary: paymentRef dari URL — validasi format ketat sebelum filter or().
  if (!/^[A-Za-z0-9-]{6,40}$/.test(paymentReference)) {
    throw new ApiError("PAYMENT_NOT_FOUND", "Payment tidak ditemukan");
  }
  const supabase = createServerClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("business_id", businessId)
    .or(`payment_reference.eq.${paymentReference},order_id.eq.${paymentReference}`)
    .maybeSingle();
  const row = (data ?? null) as unknown as PaymentRow | null;
  if (!row) throw new ApiError("PAYMENT_NOT_FOUND", "Payment tidak ditemukan");
  return row;
}

/**
 * Payment untuk jalur KIOSK: harus milik booth pemegang device token. Tanpa
 * filter photobox_id, token booth A bisa membaca status, menyettlekan, dan
 * mengambil result_token pembayaran booth B (foto customer lain).
 */
export async function loadPaymentByReferenceForPhotobox(
  businessId: string,
  photoboxId: string,
  paymentReference: string
): Promise<PaymentRow> {
  if (!/^[A-Za-z0-9-]{6,40}$/.test(paymentReference)) {
    throw new ApiError("PAYMENT_NOT_FOUND", "Payment tidak ditemukan");
  }
  const supabase = createServerClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("business_id", businessId)
    .eq("photobox_id", photoboxId)
    .or(`payment_reference.eq.${paymentReference},order_id.eq.${paymentReference}`)
    .maybeSingle();
  const row = (data ?? null) as unknown as PaymentRow | null;
  if (!row) throw new ApiError("PAYMENT_NOT_FOUND", "Payment tidak ditemukan");
  return row;
}

/** Setting owner: menit expiry QRIS (business_settings.checkout, default 3). */
export async function getQrisExpiryMinutes(businessId: string): Promise<number | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("business_settings")
    .select("checkout")
    .eq("business_id", businessId)
    .maybeSingle();
  const checkout = (data as { checkout?: { qris_expiry_minutes?: number } } | null)?.checkout;
  return checkout?.qris_expiry_minutes ?? null;
}

/**
 * Timezone bisnis untuk penomoran transaksi harian. Nomor TX memakai tanggal
 * lokal bisnis — bukan Jakarta tetap — supaya laporan harian WITA/WIT tidak
 * beda hari dari transaksinya.
 */
export async function getBusinessTimezone(businessId: string): Promise<string> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("businesses")
    .select("timezone")
    .eq("id", businessId)
    .maybeSingle();
  return (data as { timezone?: string } | null)?.timezone ?? "Asia/Jakarta";
}

// ---------------------------------------------------------------------------
// Voucher — validasi server-side lengkap (docs/06 §6.2)
// ---------------------------------------------------------------------------

type VoucherContext = { packageId: string; outletId: string | null; grossAmount: number };

export async function validateVoucherForCheckout(
  businessId: string,
  code: string,
  ctx: VoucherContext
): Promise<{ voucherId: string; code: string; discount: number }> {
  // Entitlement dicek di jalur KONSUMSI, bukan hanya CRUD dashboard: tenant
  // yang downgrade tetap menyimpan vouchers aktif, dan tanpa cek ini voucher
  // (fitur Business) masih bisa dipakai di kiosk.
  await requireFeature(businessId, "voucher");
  const supabase = createServerClient();
  const { data: voucher } = await supabase
    .from("vouchers")
    .select(
      "id, code, type, amount, start_date, end_date, usage_limit, min_transaction, max_discount, is_active"
    )
    .eq("business_id", businessId)
    .eq("code", code)
    .maybeSingle();
  const row = (voucher ?? null) as unknown as {
    id: string;
    code: string;
    type: "percentage" | "fixed";
    amount: number;
    start_date: string | null;
    end_date: string | null;
    usage_limit: number | null;
    min_transaction: number;
    max_discount: number | null;
    is_active: boolean;
  } | null;

  if (!row || !row.is_active) {
    throw new ApiError("VOUCHER_INVALID", "Voucher tidak valid");
  }
  const now = Date.now();
  if (row.start_date && Date.parse(row.start_date) > now) {
    throw new ApiError("VOUCHER_INVALID", "Voucher belum berlaku");
  }
  if (row.end_date && Date.parse(row.end_date) < now) {
    throw new ApiError("VOUCHER_EXPIRED", "Voucher sudah kedaluwarsa");
  }
  if (row.min_transaction > ctx.grossAmount) {
    throw new ApiError(
      "VOUCHER_MIN_NOT_MET",
      `Minimal transaksi ${row.min_transaction} untuk voucher ini`
    );
  }

  if (row.usage_limit !== null) {
    const { count } = await supabase
      .from("voucher_usages")
      .select("id", { count: "exact", head: true })
      .eq("voucher_id", row.id);
    if ((count ?? 0) >= row.usage_limit) {
      throw new ApiError("VOUCHER_LIMIT_REACHED", "Kuota voucher sudah habis");
    }
  }

  const [{ data: pkgLinks }, { data: outletLinks }] = await Promise.all([
    supabase.from("voucher_packages").select("package_id").eq("voucher_id", row.id),
    supabase.from("voucher_outlets").select("outlet_id").eq("voucher_id", row.id),
  ]);
  const pkgAllowed = (pkgLinks ?? []).map((r) => r.package_id);
  if (pkgAllowed.length > 0 && !pkgAllowed.includes(ctx.packageId)) {
    throw new ApiError("VOUCHER_INVALID", "Voucher tidak berlaku untuk package ini");
  }
  const outletAllowed = (outletLinks ?? []).map((r) => r.outlet_id);
  if (ctx.outletId && outletAllowed.length > 0 && !outletAllowed.includes(ctx.outletId)) {
    throw new ApiError("VOUCHER_INVALID", "Voucher tidak berlaku untuk outlet ini");
  }

  // ponytail: usage_per_customer dilewat — kiosk tanpa identitas customer (no-login);
  // aktifkan saat booking/identitas customer tersedia (Phase 2).
  const discount = computeVoucherDiscount({
    gross_amount: ctx.grossAmount,
    type: row.type,
    amount: row.amount,
    max_discount: row.max_discount,
  });
  return { voucherId: row.id, code: row.code, discount };
}
