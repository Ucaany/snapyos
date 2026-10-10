import "server-only"
import { randomUUID } from "node:crypto"
import { ApiError } from "@/lib/api-errors"
import { buildOrderId } from "@/lib/qris-helpers"
import type { PaymentProvider, QrisCreateResponse } from "@/server/payment/types"
import { createPakasirGateway } from "@/server/payment/providers/pakasir"

const gateway = createPakasirGateway(null)

export const pakasirProvider: PaymentProvider = {
  async createQris({ amount, paymentReference: requestedReference }) {
    const paymentReference = requestedReference ?? randomUUID().replace(/-/g, "").slice(0, 12)
    const orderId = buildOrderId(paymentReference)
    let result
    try {
      result = await gateway.createTransaction({
        orderId,
        amount,
        description: "SnapyOS",
        callbackUrl: "",
      })
    } catch {
      throw new ApiError("INTERNAL", "Gagal membuat QRIS Pakasir. Coba lagi.")
    }
    return {
      order_id: result.orderId,
      amount: result.amount,
      amount_uniq: result.totalAmount - result.amount,
      total_amount: result.totalAmount,
      status: "PENDING",
      qris_url: result.qrImageUrl,
      qris_image: result.qrString,
      expired_at: result.expiresAt,
      signature: "",
      payment_reference: paymentReference,
      provider_ref: result.providerRef || null,
    } satisfies QrisCreateResponse
  },

  async getStatus(orderId, amount, providerRef) {
    if (!Number.isInteger(amount) || (amount ?? -1) < 0) {
      throw new ApiError("INTERNAL", "Nominal payment Pakasir tidak valid.")
    }
    const status = await gateway.getStatus(orderId, amount, providerRef)
    return status === "paid" || status === "expired" ? status : "pending"
  },
}
