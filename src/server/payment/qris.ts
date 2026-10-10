import "server-only"
import { ApiError } from "@/lib/api-errors"
import { needsSettlementRecovery } from "@/server/payment/settlement-recovery"
import { createServerClient } from "@/lib/supabase/server"
import { resolveGatewayFromCredential } from "./providers/gateway-factory"
import { resolveGatewayByCredential } from "./providers/registry"
import { loadCheckout, loadPaymentByReference, requireDevice, type PaymentRow } from "./checkout-shared"
import {
  runPaidSideEffects,
  transitionPaymentToExpired,
  transitionPaymentToPaid,
} from "./settlement"
import { paymentResponse } from "./payment-response"

async function expireCheckout(id: string) {
  await createServerClient()
    .from("checkout_sessions")
    .update({ status: "expired" })
    .eq("id", id)
    .eq("status", "open")
}

export async function getPaymentStatus(
  businessSlug: string,
  paymentReference: string,
  deviceToken: string
) {
  const device = await requireDevice(businessSlug, deviceToken)
  const payment = await loadPaymentByReference(device.businessId, paymentReference)
  if (
    (payment.status === "pending" || payment.status === "expired") &&
    payment.provider !== "cash"
  ) {
    try {
      const gateway = payment.credential_id
        ? await resolveGatewayByCredential(payment.credential_id)
        // OBSOLETESC (2026-09-18): aggregator env deactivated pentru kiosk;
        // branch hanya untuk legacy payment in-flight masih pending.
        : payment.provider === "pakasir"
          ? resolveGatewayFromCredential(null)
          : null
      const status = gateway
        ? await gateway.getStatus(payment.order_id, payment.final_amount, payment.provider_ref)
        : "pending"
      if (
        status === "paid" &&
        (await transitionPaymentToPaid(payment.id, ["pending", "expired"]))
      ) {
        await runPaidSideEffects(
          payment,
          await loadCheckout(payment.business_id, payment.checkout_session_id)
        )
        payment.status = "paid"
      } else if (
        payment.status === "pending" &&
        status === "expired" &&
        (await transitionPaymentToExpired(payment.id))
      ) {
        payment.status = "expired"
        await expireCheckout(payment.checkout_session_id)
      }
    } catch {
      /* gateway outage keeps pending status */
    }
  }
  if (
    payment.status === "pending" &&
    payment.expires_at &&
    Date.now() >= new Date(payment.expires_at).getTime() &&
    (await transitionPaymentToExpired(payment.id))
  ) {
    payment.status = "expired"
    await expireCheckout(payment.checkout_session_id)
  }
  let resultToken: string | null = null
  if (payment.status === "paid") {
    let checkout = await loadCheckout(payment.business_id, payment.checkout_session_id)
    if (
      needsSettlementRecovery({
        transaction_id: payment.transaction_id,
        checkout_status: checkout.status,
      })
    ) {
      try {
        await runPaidSideEffects(payment, checkout)
        checkout = await loadCheckout(payment.business_id, payment.checkout_session_id)
      } catch {
        /* next poll retries */
      }
    }
    resultToken = checkout.result_token
  }
  return { ...paymentResponse(payment), result_token: resultToken }
}

/** Core settle cash — dipakai route device & operator (dashboard/staff). */
export async function settleCashPayment(payment: PaymentRow) {
  if (payment.status === "paid") return paymentResponse(payment)
  if (
    payment.status !== "pending" ||
    (payment.expires_at && Date.now() >= new Date(payment.expires_at).getTime())
  ) {
    await transitionPaymentToExpired(payment.id)
    await expireCheckout(payment.checkout_session_id)
    throw new ApiError("PAYMENT_EXPIRED", "Permintaan tunai sudah berakhir")
  }
  if (!(await transitionPaymentToPaid(payment.id)))
    throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Payment sudah diproses")
  await runPaidSideEffects(
    payment,
    await loadCheckout(payment.business_id, payment.checkout_session_id)
  )
  payment.status = "paid"
  return paymentResponse(payment)
}

/** Route authorization is mandatory; customer kiosk cannot call this itself. */
export async function confirmCashPayment(
  businessSlug: string,
  paymentReference: string,
  deviceToken: string
) {
  const device = await requireDevice(businessSlug, deviceToken)
  const payment = await loadPaymentByReference(device.businessId, paymentReference)
  if (payment.provider !== "cash" || payment.photobox_id !== device.photobox.id)
    throw new ApiError("PAYMENT_NOT_FOUND", "Permintaan tunai tidak ditemukan")
  return settleCashPayment(payment)
}
