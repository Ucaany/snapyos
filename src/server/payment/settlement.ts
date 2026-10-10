/**
 * Payment settlement — status transitions + side effects (docs/06 §6.7, §6.12).
 * Idempotent: safe to call multiple times for recovery.
 */

import "server-only"
import { randomUUID } from "node:crypto"
import { createServerClient } from "@/lib/supabase/server"
import { ApiError } from "@/lib/api-errors"
import { generateResultToken } from "@/lib/device-token"
import { formatTxNumber, todayISO } from "@/lib/dashboard-math"
import { insertAudit } from "@/server/audit"
import type { CheckoutRow, PaymentRow } from "./checkout-shared"

// ---------------------------------------------------------------------------
// Status transitions (docs/06 §6.7, §6.12)
// ---------------------------------------------------------------------------

/**
 * Gate idempotency: pending → paid (satu pemenang). Webhook boleh merecovery
 * expired → paid (customer membayar QR yang baru saja di-void lokal — uang
 * nyata terpotong, wajib diakui; signature+amount sudah divalidasi pemanggil).
 * `paid` tetap tidak bisa mundur.
 */
export async function transitionPaymentToPaid(
  paymentId: string,
  fromStatuses: string[] = ["pending"]
): Promise<boolean> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", paymentId)
    .in("status", fromStatuses)
    .select("id")
    .maybeSingle()
  // M4: error DB diabaikan → settle tak terlihat sukses/gagal. Lempar →
  // route balas 500 → provider retry (webhook belum di-promote processed).
  if (error) throw new Error(`Gagal transisi payment ke paid: ${error.message}`)
  return Boolean(data)
}

export async function transitionPaymentToExpired(paymentId: string): Promise<boolean> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "expired" })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`Gagal transisi payment ke expired: ${error.message}`)
  return Boolean(data)
}

// ---------------------------------------------------------------------------
// Paid side effects (docs/06 §6.7)
// ---------------------------------------------------------------------------

/**
 * Transaksi + voucher usage + checkout paid + result_token.
 * Idempotent — aman dipanggil ulang (recovery): tiap efek dicek dulu sebelum
 * dieksekusi, jadi run ulang hanya melengkapi efek yang belum jadi.
 */
export async function runPaidSideEffects(payment: PaymentRow, checkout: CheckoutRow) {
  const resultToken = checkout.result_token ?? generateResultToken()
  const txNumber = formatTxNumber(
    todayISO("Asia/Jakarta"),
    randomUUID().replace(/-/g, "").slice(0, 6)
  )
  const { data, error } = await createServerClient().rpc("settle_paid_payment_atomically", {
    p_payment_id: payment.id,
    p_transaction_number: txNumber,
    p_result_token: resultToken,
  })
  const settled = (
    data as { transaction_number: string; result_token: string; settled_now: boolean }[] | null
  )?.[0]
  if (error || !settled) throw new ApiError("INTERNAL", "Gagal menyelesaikan payment")
  if (settled.settled_now) {
    await insertAudit({
      actorId: null,
      businessId: payment.business_id,
      action: "payment.paid",
      target: payment.id,
      meta: {
        order_id: payment.order_id,
        amount: payment.final_amount,
        transaction: settled.transaction_number,
        ...(payment.credential_id ? { credential_id: payment.credential_id } : {}),
      },
    })
  }
  return { transactionNumber: settled.transaction_number, resultToken: settled.result_token }
}
