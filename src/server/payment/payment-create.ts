import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-errors";
import { paymentWebhookUrl } from "@/lib/payment-credentials";
import {
  encodeKioskPaymentPayload,
  normalizePaymentMethod,
  type KioskPaymentPayload,
} from "@/server/payment/kiosk-payment";
import { buildOrderId } from "@/lib/qris-helpers";
import { computeQrisExpiresAt } from "@/lib/session-timer";
import { generateResultToken } from "@/lib/device-token";
import { formatTxNumber, todayISO } from "@/lib/dashboard-math";
import { createServerClient } from "@/lib/supabase/server";
import { assertSessionCapacity } from "@/server/session-capacity";
import { requireFeature } from "@/server/feature-gate";
import { paymentCreateSchema, type PaymentCreateInput } from "@/lib/validators";
import { resolveGatewayByCredential } from "./providers/registry";
import type { PaymentRow } from "./checkout-shared";
import {
  getBusinessTimezone,
  getQrisExpiryMinutes,
  loadCheckoutForPhotobox,
  requireDevice,
} from "./checkout-shared";
import { resolveKioskPaymentMethod } from "./payment-methods";
import { transitionPaymentToExpired } from "./settlement";
import { paymentResponse, type PaymentResponse } from "./payment-response";

const ref = () => randomUUID().replace(/-/g, "").slice(0, 12);
function inserted(data: unknown, error: unknown): PaymentRow {
  if (error || !data) {
    // Trigger 0083 menolak payment yang melewati kuota voucher (P0001).
    const e = error as { message?: string; code?: string } | null;
    if (e && (e.code === "P0001" || /VOUCHER_LIMIT_REACHED/i.test(e.message ?? ""))) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Kuota voucher sudah habis. Hapus voucher lalu buat pembayaran baru."
      );
    }
    throw new ApiError("INTERNAL", "Gagal mencatat payment");
  }
  return data as PaymentRow;
}

/** Server controls the checkout amount, credential, payment method, and expiry. */
export async function createPayment(
  businessSlug: string,
  input: PaymentCreateInput
): Promise<PaymentResponse> {
  const parsed = paymentCreateSchema.parse(input);
  const device = await requireDevice(businessSlug, parsed.device_token);
  const checkout = await loadCheckoutForPhotobox(
    device.businessId,
    device.photobox.id,
    parsed.checkout_session_id
  );
  if (checkout.status === "paid")
    throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Checkout sudah dibayar");
  if (checkout.status !== "open")
    throw new ApiError("PAYMENT_EXPIRED", "Checkout sudah berakhir: mulai ulang");
  const supabase = createServerClient();
  // Request yang mati sebelum provider merespons tidak boleh mengunci checkout selamanya.
  await supabase
    .from("payments")
    .update({ status: "expired" })
    .eq("checkout_session_id", checkout.id)
    .eq("status", "creating")
    .lt("created_at", new Date(Date.now() - 2 * 60_000).toISOString());
  const { data: existing } = await supabase
    .from("payments")
    .select("*")
    .eq("checkout_session_id", checkout.id)
    .in("status", ["creating", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pending = (existing ?? null) as unknown as PaymentRow | null;
  if (pending?.status === "creating")
    throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Payment lain sedang dibuat");
  if (pending?.expires_at && Date.now() < new Date(pending.expires_at).getTime())
    throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Payment lain masih menunggu pembayaran");
  if (pending?.status === "pending") await transitionPaymentToExpired(pending.id);
  let resolved: Awaited<ReturnType<typeof resolveKioskPaymentMethod>>;
  try {
    resolved = await resolveKioskPaymentMethod(
      device.businessId,
      device.photobox.id,
      parsed.method_id,
      checkout.final_amount
    );
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Metode pembayaran tidak tersedia");
  }
  const { method, credentialId } = resolved;
  if (method.kind === "voucher" && checkout.final_amount > 0)
    throw new ApiError("VALIDATION_ERROR", "Voucher belum menutup seluruh pembayaran");
  await assertSessionCapacity(device.businessId, device.photobox.id);
  const paymentReference = ref();
  const orderId = buildOrderId(paymentReference);
  const expiryMinutes = await getQrisExpiryMinutes(device.businessId);
  const base = {
    business_id: device.businessId,
    checkout_session_id: checkout.id,
    outlet_id: checkout.outlet_id,
    photobox_id: checkout.photobox_id,
    package_id: checkout.package_id,
    gross_amount: checkout.gross_amount,
    discount_amount: checkout.discount_amount,
    voucher_id: checkout.voucher_id,
    final_amount: checkout.final_amount,
    order_id: orderId,
    payment_reference: paymentReference,
  };
  if (method.kind === "voucher") {
    // Voucher = fitur plan berbayar; cek juga di titik settle (bukan hanya
    // saat checkout dibuat) karena plan bisa turun di antara keduanya.
    await requireFeature(device.businessId, "voucher");
    const tz = await getBusinessTimezone(device.businessId);
    const { data, error } = await supabase.rpc("create_voucher_payment_atomically", {
      p_checkout_id: checkout.id,
      p_business_id: device.businessId,
      p_payment_reference: paymentReference,
      p_order_id: orderId,
      p_transaction_number: formatTxNumber(
        todayISO(tz),
        randomUUID().replace(/-/g, "").slice(0, 6)
      ),
      p_result_token: generateResultToken(),
    });
    const result = (data as { payment_id: string | null; reason: string }[] | null)?.[0];
    if (error || !result) throw new ApiError("INTERNAL", "Gagal memproses voucher");
    if (result.reason === "LIMIT")
      throw new ApiError("VOUCHER_LIMIT_REACHED", "Kuota voucher sudah habis");
    if (result.reason !== "OK" || !result.payment_id)
      throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Checkout sudah diproses");
    const { data: payment } = await supabase
      .from("payments")
      .select("*")
      .eq("id", result.payment_id)
      .single();
    return paymentResponse(inserted(payment, null), null);
  }
  if (method.kind === "cash") {
    const { data, error } = await supabase
      .from("payments")
      .insert({
        ...base,
        total_amount: checkout.final_amount,
        provider: "cash",
        status: "pending",
        expires_at: computeQrisExpiresAt(expiryMinutes, null),
      })
      .select("*")
      .single();
    // Partial unique index uq_pay_active_per_checkout — tunai kedua harus jadi
    // 409, bukan 500 (jalur gateway sudah memetakan ini).
    if (error && (error as { code?: string }).code === "23505")
      throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Checkout sudah diproses");
    return paymentResponse(inserted(data, error), null);
  }
  // Metode gateway SELALU dipilih dari credential milik business ini
  // (resolveKioskPaymentMethod → credentialId non-null). Jadi credentialId null
  // di sini = bug pemanggil, bukan alasan fallback.
  if (!credentialId)
    throw new ApiError("VALIDATION_ERROR", "Metode pembayaran tidak punya credential aktif");
  // Credential tidak bisa dipakai (tidak ada / tidak bisa didekripsi karena key
  // dirotasi / payload rusak) → GAGAL, jangan diam-diam pindah provider.
  // Fallback lintas-provider akan menagih lewat merchant lain (mis. aggregator
  // platform) padahal metode yang dipilih customer milik provider berbeda —
  // dana bisa masuk ke akun yang salah. Owner harus perbaiki credential dulu.
  const gateway = await resolveGatewayByCredential(credentialId);
  if (!gateway)
    throw new ApiError(
      "VALIDATION_ERROR",
      "Credential pembayaran tidak dapat dipakai. Perbarui credential merchant di Settings Payment."
    );
  // Metode gateway wajib ter-normalisasi dari kiosk; string kosong = bug
  // pemanggil, bukan alasan menagih lewat kanal default (qris).
  const normalizedMethod = method.method
    ? normalizePaymentMethod(gateway.provider, method.method)
    : null;
  if (!normalizedMethod)
    throw new ApiError(
      "VALIDATION_ERROR",
      "Metode pembayaran tidak valid untuk credential gateway ini"
    );
  const resolvedCallbackUrl =
    gateway.provider === "pakasir" ? "" : paymentWebhookUrl(gateway.provider);
  if (gateway.provider !== "pakasir" && !resolvedCallbackUrl)
    throw new ApiError("INTERNAL", "URL callback gateway belum dikonfigurasi aman");

  // Claim sebelum request provider. Tanpa ini dua POST paralel sama-sama dapat
  // membuat QR provider karena keduanya belum melihat payment pending.
  const { data: reserved, error: reserveError } = await supabase
    .from("payments")
    .insert({
      ...base,
      total_amount: checkout.final_amount,
      provider: gateway.provider,
      credential_id: credentialId,
      status: "creating",
    })
    .select("*")
    .single();
  if (reserveError || !reserved) {
    if ((reserveError as { code?: string } | null)?.code === "23505") {
      throw new ApiError(
        "PAYMENT_ALREADY_PROCESSED",
        "Payment lain sedang dibuat atau menunggu pembayaran"
      );
    }
    throw new ApiError("INTERNAL", "Gagal menyiapkan payment");
  }
  const reservation = reserved as unknown as PaymentRow;
  const callbackUrl = resolvedCallbackUrl ?? "";
  const returnUrl = callbackUrl
    ? new URL(`/p/${businessSlug}/${device.photobox.slug}`, callbackUrl).toString()
    : undefined;
  try {
    const created = await gateway.createTransaction({
      orderId,
      amount: checkout.final_amount,
      description: `SnapyOS ${checkout.package_id}`,
      callbackUrl,
      returnUrl,
      paymentMethods: [normalizedMethod],
    });
    if (
      created.orderId !== orderId ||
      created.amount !== checkout.final_amount ||
      !Number.isInteger(created.totalAmount) ||
      created.totalAmount < created.amount
    ) {
      throw new ApiError("INTERNAL", "Respons gateway pembayaran tidak valid");
    }
    const display =
      method.display === "redirect" &&
      !created.paymentUrl &&
      (created.qrString || created.qrImageUrl)
        ? "qris"
        : method.display === "va" || method.display === "redirect"
          ? method.display
          : "qris";
    const payload: KioskPaymentPayload = {
      display,
      method: normalizedMethod,
      qrString: created.qrString,
      qrImageUrl: created.qrImageUrl,
      paymentUrl: created.paymentUrl,
      vaNumber: created.vaNumber,
    };
    const { data, error } = await supabase
      .from("payments")
      .update({
        order_id: created.orderId,
        amount_uniq: created.totalAmount - created.amount,
        total_amount: created.totalAmount,
        qr_string: encodeKioskPaymentPayload(payload),
        expires_at: computeQrisExpiresAt(expiryMinutes, created.expiresAt),
        provider_ref: created.providerRef || null,
        status: "pending",
      })
      .eq("id", reservation.id)
      .eq("status", "creating")
      .select("*")
      .maybeSingle();
    if (error) throw new ApiError("INTERNAL", "Gagal menyimpan payment");
    if (data) return paymentResponse(data as unknown as PaymentRow, payload);

    // Webhook dapat menyelesaikan reservation sebelum respons create dipersist.
    const { data: settled } = await supabase
      .from("payments")
      .select("*")
      .eq("id", reservation.id)
      .maybeSingle();
    const payment = settled as unknown as PaymentRow | null;
    if (payment?.status === "paid") return paymentResponse(payment, payload);
    throw new ApiError("INTERNAL", "Status payment berubah saat QRIS dibuat");
  } catch (error) {
    await supabase
      .from("payments")
      .update({ status: "expired" })
      .eq("id", reservation.id)
      .eq("status", "creating");
    throw error;
  }
}
