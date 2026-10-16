// Ekstensi `.ts` eksplisit: modul ini dites langsung oleh
// `node --experimental-strip-types`, yang tidak me-resolve import tanpa ekstensi.
import type { KioskPaymentPayload } from "./kiosk-payment.ts"
import { decodeKioskPaymentPayload } from "./kiosk-payment.ts"
import type { PaymentRow } from "./checkout-shared.ts"

export type PaymentResponse = {
  /** "expired" hanya dari status payment yang memang kedaluwarsa (docs/06 §6.4). */
  status: "pending" | "paid" | "expired"
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

  // Konvensi bersama (sama dengan jalur invoice, lihat invoice.ts): `qr_image`
  // = payload QRIS mentah (EMVCo string) bila provider mengirim string, bukan
  // URL; `qr_url` = tautan gambar http(s). Sebelumnya keduanya diisi URL gambar
  // sehingga pembaca `qr_image` sebagai string QRIS selalu dapat null.
  const imageUrl = payload?.qrImageUrl ?? null
  const rawQr = payload?.qrString && !payload.qrString.startsWith("http") ? payload.qrString : null

  return {
    status:
      payment.status === "paid"
        ? "paid"
        : payment.status === "expired"
          ? "expired"
          : "pending",
    payment_reference: payment.payment_reference,
    order_id: payment.order_id,
    display,
    method: payload?.method ?? payment.provider,
    qr_string: payload?.qrString ?? null,
    qr_image: rawQr ?? imageUrl,
    qr_url: imageUrl?.startsWith("http") ? imageUrl : null,
    payment_url: payload?.paymentUrl ?? null,
    va_number: payload?.vaNumber ?? null,
    amount: payment.final_amount,
    total_amount: payment.total_amount ?? payment.final_amount,
    expires_at: payment.expires_at,
    checkout_session_id: payment.checkout_session_id,
  }
}
