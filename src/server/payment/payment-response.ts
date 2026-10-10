import type { KioskPaymentPayload } from "./kiosk-payment"
import { decodeKioskPaymentPayload } from "./kiosk-payment"
import type { PaymentRow } from "./checkout-shared"

export type PaymentResponse = {
  status: "pending" | "paid"
  payment_reference: string
  order_id: string
  display: "qris" | "va" | "redirect" | "cash" | "voucher"
  method: string
  qr_string: string | null
  qr_image: string | null
  qr_url: string | null
  payment_url: string | null
  va_number: string | null
  amount: number
  total_amount: number
  expires_at: string | null
  checkout_session_id: string
}

/** Satu serializer untuk response create + polling agar kontrak tidak drift. */
export function paymentResponse(
  payment: PaymentRow,
  payload: KioskPaymentPayload | null = decodeKioskPaymentPayload(payment.qr_string)
): PaymentResponse {
  const display =
    payment.provider === "cash"
      ? "cash"
      : payment.provider === "voucher"
        ? "voucher"
        : (payload?.display ?? "qris")

  return {
    status: payment.status === "paid" ? "paid" : "pending",
    payment_reference: payment.payment_reference,
    order_id: payment.order_id,
    display,
    method: payload?.method ?? payment.provider,
    qr_string: payload?.qrString ?? null,
    qr_image: payload?.qrImageUrl ?? null,
    qr_url: payload?.qrImageUrl ?? null,
    payment_url: payload?.paymentUrl ?? null,
    va_number: payload?.vaNumber ?? null,
    amount: payment.final_amount,
    total_amount: payment.total_amount ?? payment.final_amount,
    expires_at: payment.expires_at,
    checkout_session_id: payment.checkout_session_id,
  }
}
