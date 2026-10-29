/**
 * Checkout create + apply voucher — docs/08 §8.14.
 * Backend = source of truth harga: final = gross − voucher discount, selalu dihitung ulang.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { computeFinalAmount } from "@/lib/checkout-math";
import { assertSessionCapacity } from "@/server/session-capacity";
import { resolveGateway, resolveGatewayByCredential } from "@/server/payment/providers/registry";
import { checkoutApplyVoucherSchema, checkoutCreateSchema } from "@/lib/validators";
import type { CheckoutApplyVoucherInput, CheckoutCreateInput } from "@/lib/validators";
import type { PaymentRow } from "./checkout-shared";
import {
  requireDevice,
  loadCheckout,
  loadCheckoutForPhotobox,
  validateVoucherForCheckout,
} from "./checkout-shared";
import { transitionPaymentToPaid, runPaidSideEffects } from "./settlement";
import { listKioskPaymentMethods } from "./payment-methods";

// ---------------------------------------------------------------------------
// Guard: limit sesi diperketat — dicek SEBELUM pembayaran (bukan hanya POST /sessions).
// Implementasi bersama: src/server/session-capacity.ts (dipakai juga createSession).
// ---------------------------------------------------------------------------

/**
 * Fix double payment: checkout baru untuk sebuah photobox menghanguskan semua
 * checkout `open` + payment `pending` photobox tsb → hanya 1 QR hidup per booth.
 * Anti money-loss: payment pending yang masih dalam masa berlaku dicek dulu ke
 * provider — bila ternyata sudah dibayar (webhook in-flight), transisi ke paid
 * + side effects, bukan di-void. Payment yang sudah lewat expiry di-void saja
 * (webhook `paid` tetap bisa merecovery expired → paid, lihat handlePakasirWebhook).
 */
export async function expireStaleCheckoutsForPhotobox(photoboxId: string) {
  const supabase = createServerClient();

  const { data: openCheckouts } = await supabase
    .from("checkout_sessions")
    .select("id")
    .eq("photobox_id", photoboxId)
    .eq("status", "open");
  const ids = (openCheckouts ?? []).map((r) => r.id);
  if (ids.length === 0) return;

  // Payment pending yang masih hidup: pastikan belum dibayar di provider.
  // Reservation `creating` belum memiliki QR provider, langsung dihanguskan batch.
  const { data: livePayments } = await supabase
    .from("payments")
    .select("*")
    .in("checkout_session_id", ids)
    .eq("status", "pending");
  for (const row of (livePayments ?? []) as unknown as PaymentRow[]) {
    const expired = row.expires_at && Date.now() >= new Date(row.expires_at).getTime();
    if (expired) continue; // sudah stale: di-void batch di bawah.
    try {
      // Gateway mengikuti credential yang JAHIT payment. Credential hilang/tak
      // bisa didekripsi → JANGAN pindah ke credential lain milik business yang
      // sama: status akan dibaca dari akun merchant berbeda dan payment bisa
      // di-settle padahal uangnya masuk ke akun lain (fail-closed, sama dengan
      // registry.ts/payment-create.ts/qris.ts). Keluar tanpa void: payment
      // mungkin masih hidup di provider, biar webhook/recovery yang memutuskan.
      const gateway = row.credential_id
        ? await resolveGatewayByCredential(row.credential_id)
        : await resolveGateway(row.business_id);
      if (!gateway) return;
      const providerStatus = await gateway.getStatus(
        row.order_id,
        row.final_amount,
        row.provider_ref
      );
      if (providerStatus === "paid" && (await transitionPaymentToPaid(row.id))) {
        const checkout = await loadCheckout(row.business_id, row.checkout_session_id);
        await runPaidSideEffects(row, checkout);
      }
    } catch {
      // Provider unreachable → jangan void yang masih hidup; webhook yang settle.
      return;
    }
  }

  // Void payment yang aman: reservation `creating` (belum ada QR) atau `pending`
  // yang SUDAH lewat expires_at. Payment pending yang masih berlaku TIDAK di-void
  // saat provider status ambigu — itu ghost payment (QR masih discan customer).
  // Webhook `paid` tetap bisa merecovery expired → paid + side effects.
  await supabase
    .from("payments")
    .update({ status: "expired" })
    .in("checkout_session_id", ids)
    .eq("status", "creating");
  await supabase
    .from("payments")
    .update({ status: "expired" })
    .in("checkout_session_id", ids)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  await supabase
    .from("checkout_sessions")
    .update({ status: "expired" })
    .in("id", ids)
    .eq("status", "open");
}

// ---------------------------------------------------------------------------
// Checkout create + apply voucher — docs/08 §8.14
// ---------------------------------------------------------------------------

/** Buat checkout pay-first (SEBELUM sesi foto). */
export async function createCheckout(businessSlug: string, input: CheckoutCreateInput) {
  const parsed = checkoutCreateSchema.parse(input);
  const device = await requireDevice(businessSlug, parsed.device_token);
  const supabase = createServerClient();

  // Limit diperketat: cek KAPASITAS SEBELUM checkout dibuat (mencegah bayar → gagal sesi).
  await assertSessionCapacity(device.businessId, device.photobox.id);

  // Hanya 1 QR hidup per booth: checkout open + payment pending lama dihanguskan.
  await expireStaleCheckoutsForPhotobox(device.photobox.id);

  const { data: pkg } = await supabase
    .from("packages")
    .select("id, name, price")
    .eq("id", parsed.package_id)
    .eq("business_id", device.businessId)
    .eq("is_active", true)
    .maybeSingle();
  const pkgRow = (pkg ?? null) as unknown as { id: string; name: string; price: number } | null;
  if (!pkgRow) throw new ApiError("NOT_FOUND", "Package tidak ditemukan");

  // Eligibilitas photobox/outlet (docs/05 §5.3) — sama dengan listPublicPackages.
  const [{ data: pbLinks }, { data: outletLinks }] = await Promise.all([
    supabase.from("package_photoboxes").select("photobox_id").eq("package_id", pkgRow.id),
    supabase.from("package_outlets").select("outlet_id").eq("package_id", pkgRow.id),
  ]);
  const pbAllowed = (pbLinks ?? []).map((r) => r.photobox_id);
  if (pbAllowed.length > 0 && !pbAllowed.includes(device.photobox.id)) {
    throw new ApiError("NOT_FOUND", "Package tidak tersedia untuk booth ini");
  }
  const outletAllowed = (outletLinks ?? []).map((r) => r.outlet_id);
  if (outletAllowed.length > 0 && !outletAllowed.includes(device.photobox.outlet_id)) {
    throw new ApiError("NOT_FOUND", "Package tidak tersedia untuk booth ini");
  }

  let voucher: { voucherId: string; code: string; discount: number } | null = null;
  if (parsed.voucher_code) {
    voucher = await validateVoucherForCheckout(device.businessId, parsed.voucher_code, {
      packageId: pkgRow.id,
      outletId: device.photobox.outlet_id,
      grossAmount: pkgRow.price,
    });
  }

  const gross = pkgRow.price;
  const discount = voucher?.discount ?? 0;
  const { data: checkout, error } = await supabase
    .from("checkout_sessions")
    .insert({
      business_id: device.businessId,
      outlet_id: device.photobox.outlet_id,
      photobox_id: device.photobox.id,
      package_id: pkgRow.id,
      voucher_id: voucher?.voucherId ?? null,
      gross_amount: gross,
      discount_amount: discount,
      final_amount: computeFinalAmount(gross, discount),
      status: "open",
    })
    .select("id, gross_amount, discount_amount, final_amount")
    .single();
  if (error?.code === "23505") {
    throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Checkout lain sedang aktif untuk booth ini");
  }
  if (error || !checkout) throw new ApiError("INTERNAL", "Gagal membuat checkout");

  return {
    checkout_session_id: checkout.id,
    gross_amount: checkout.gross_amount,
    discount_amount: checkout.discount_amount,
    final_amount: checkout.final_amount,
    voucher: voucher ? { code: voucher.code, discount_amount: voucher.discount } : null,
    payment_methods: await listKioskPaymentMethods(
      device.businessId,
      device.photobox.id,
      checkout.final_amount
    ),
  };
}

type VoucherApplyRow = {
  checkout_id: string;
  gross_amount: number;
  discount_amount: number;
  final_amount: number;
  reason: string;
};

/** PostgREST: fungsi RPC belum ada (migrasi belum diterapkan). */
function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    (error.message ?? "").toLowerCase().includes("could not find the function")
  );
}

/** Terapkan voucher ke checkout open (sebelum QRIS dibuat). */
export async function applyVoucherToCheckout(
  businessSlug: string,
  input: CheckoutApplyVoucherInput
) {
  const parsed = checkoutApplyVoucherSchema.parse(input);
  const device = await requireDevice(businessSlug, parsed.device_token);
  const supabase = createServerClient();

  const checkout = await loadCheckoutForPhotobox(
    device.businessId,
    device.photobox.id,
    parsed.checkout_session_id
  );
  if (checkout.status !== "open") {
    throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Checkout sudah diproses");
  }

  const voucher = await validateVoucherForCheckout(device.businessId, parsed.voucher_code, {
    packageId: checkout.package_id,
    outletId: checkout.outlet_id,
    grossAmount: checkout.gross_amount,
  });

  const final = computeFinalAmount(checkout.gross_amount, voucher.discount);

  // Jalur utama: RPC mengunci baris checkout, memastikan belum ada payment
  // creating/pending, lalu menulis total dalam SATU transaksi. Versi lama
  // (count → update terpisah) bisa kalah balapan dengan createPayment sehingga
  // payment tercatat pada harga pra-voucher.
  const { data: rpcData, error: rpcError } = await supabase.rpc("apply_voucher_atomically", {
    p_checkout_id: checkout.id,
    p_business_id: device.businessId,
    p_photobox_id: device.photobox.id,
    p_voucher_id: voucher.voucherId,
    p_discount: voucher.discount,
    p_final: final,
  });

  if (!rpcError) {
    const row = ((rpcData ?? []) as VoucherApplyRow[])[0];
    if (!row) throw new ApiError("INTERNAL", "Gagal menerapkan voucher");
    switch (row.reason) {
      case "OK":
        return {
          checkout_session_id: row.checkout_id,
          voucher: { code: voucher.code },
          discount_amount: row.discount_amount,
          final_amount: row.final_amount,
          gross_amount: row.gross_amount,
        };
      case "PAYMENT_EXISTS":
        throw new ApiError(
          "PAYMENT_ALREADY_PROCESSED",
          "QRIS sudah dibuat: voucher tidak bisa diubah. Mulai ulang untuk pakai voucher."
        );
      case "PROCESSED":
        throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Checkout sudah diproses");
      case "NOT_FOUND":
        throw new ApiError("PAYMENT_NOT_FOUND", "Checkout tidak ditemukan");
      default:
        throw new ApiError("VALIDATION_ERROR", "Voucher tidak bisa diterapkan");
    }
  }

  // Migrasi 0082 belum diterapkan (PGRST202 = function tidak ada) → jalur lama
  // supaya deployment tidak mengunci fitur voucher. Setelah migrasi dijalankan,
  // percabangan ini tidak pernah dieksekusi.
  if (!isMissingRpc(rpcError)) {
    throw new ApiError("INTERNAL", "Gagal menerapkan voucher");
  }

  const { count: pendingPayments } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("checkout_session_id", checkout.id)
    .in("status", ["creating", "pending"]);
  if ((pendingPayments ?? 0) > 0) {
    throw new ApiError(
      "PAYMENT_ALREADY_PROCESSED",
      "QRIS sudah dibuat: voucher tidak bisa diubah. Mulai ulang untuk pakai voucher."
    );
  }

  const { data: updated, error } = await supabase
    .from("checkout_sessions")
    .update({
      voucher_id: voucher.voucherId,
      discount_amount: voucher.discount,
      final_amount: final,
    })
    .eq("id", checkout.id)
    .eq("status", "open")
    .select("id, gross_amount, discount_amount, final_amount")
    .single();
  if (error || !updated) throw new ApiError("INTERNAL", "Gagal menerapkan voucher");

  return {
    checkout_session_id: updated.id,
    voucher: { code: voucher.code },
    discount_amount: updated.discount_amount,
    final_amount: updated.final_amount,
    gross_amount: updated.gross_amount,
  };
}
