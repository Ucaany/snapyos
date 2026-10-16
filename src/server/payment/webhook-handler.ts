/**
 * Payment webhook handlers — docs/06 §6.7 (signature + idempotency + audit log).
 */

import "server-only"
import { randomUUID } from "node:crypto"
import { processDirectWebhook, type DirectWebhookDependencies } from "@/lib/direct-webhook"
import {
  invalidWebhookEventId,
  midtransEventId,
  midtransWebhookSchema,
  parseMidtransAmount,
} from "@/server/payment/midtrans-utils"
import { tripayEventId, tripayWebhookSchema, tripayWebhookAmount } from "@/server/payment/tripay-utils"
import { createServerClient } from "@/lib/supabase/server"
import {
  pakasirWebhookSchema,
  mapProviderStatus as pakasirMapStatus,
  verifyPakasirPaid,
  webhookEventId as pakasirWebhookEventId,
  isWebhookEventFresh,
  parseProviderDateTime,
  pakasirEventTimestamp,
  pakasirKioskAmountValid,
} from "@/server/payment/pakasir-utils"
import { pakasirAggregatorGateway } from "@/server/payment/pakasir"
import { parseProviderAmount } from "@/lib/qris-helpers"
import { decrypt } from "@/server/payment/providers/encrypt"
import { resolveGatewayByCredential } from "@/server/payment/providers/registry"
import { handleInvoiceWebhookEvent, handleDirectInvoiceWebhook } from "@/server/payment/invoice"
import { logPaymentWebhook, claimWebhookEvent, promoteWebhookEvent } from "@/server/payment/webhook-log"
import type { PaymentRow } from "./checkout-shared"
import { loadCheckout } from "./checkout-shared"
import {
  transitionPaymentToPaid,
  transitionPaymentToExpired,
  runPaidSideEffects,
} from "./settlement"

function directWebhookDependencies(): DirectWebhookDependencies {
  return {
    async findPayment(orderId) {
      const { data } = await createServerClient()
        .from("payments")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle()
      return (data ?? null) as unknown as PaymentRow | null
    },
    resolveGateway: resolveGatewayByCredential,
    async persist(log) {
      return logPaymentWebhook({
        provider: log.provider,
        eventId: log.eventId,
        eventType: log.eventType,
        payload: log.payload,
        signatureValid: log.signatureValid,
        status: log.status,
        paymentId: log.paymentId,
        ...(log.error ? { error: log.error } : {}),
      })
    },
    async claimEvent(log) {
      return claimWebhookEvent({
        provider: log.provider,
        eventId: log.eventId,
        eventType: log.eventType,
        payload: log.payload,
        signatureValid: log.signatureValid,
        paymentId: log.paymentId,
      })
    },
    async promoteEvent(eventId, status, error) {
      await promoteWebhookEvent({
        eventId,
        status,
        paymentId: null,
        ...(error ? { error } : {}),
      })
    },
    transitionToPaid: (paymentId) =>
      transitionPaymentToPaid(paymentId, ["creating", "pending", "expired"]),
    transitionToExpired: (paymentId) => transitionPaymentToExpired(paymentId),
    loadCheckout,
    runPaidSideEffects: (payment, checkout) =>
      runPaidSideEffects(
        payment as PaymentRow,
        checkout as Awaited<ReturnType<typeof loadCheckout>>
      ),
    // Defense-in-depth: re-fetch status langsung dari provider sebelum settle
    // (Midtrans/Tripay). Amount diverifikasi oleh adapter; gateway outage → false
    // (jangan settle; polling/recovery menyusul). Pakasir punya jalur verify sendiri.
    async verifyPaidWithProvider(gateway, payment) {
      try {
        const status = await gateway.getStatus(
          payment.order_id,
          payment.final_amount,
          (payment as unknown as { provider_ref?: string | null }).provider_ref ?? null
        )
        return status === "paid"
      } catch {
        return false
      }
    },
  }
}

/** Midtrans direct-merchant notification. Payload business/provider IDs are ignored. */
export async function handleMidtransWebhook(rawPayload: unknown) {
  const parsed = midtransWebhookSchema.safeParse(rawPayload)
  if (!parsed.success) return { ok: false, reason: "invalid_payload" as const }
  const event = parsed.data
  const status = event.transaction_status.toLowerCase()
  const fraud = event.fraud_status?.toLowerCase() ?? null

  // Branch invoice subscription: order_id bukan payment kiosk.
  const { data: kioskPayment } = await createServerClient()
    .from("payments")
    .select("id")
    .eq("order_id", event.order_id)
    .maybeSingle()
  if (!kioskPayment) {
    const result = await handleDirectInvoiceWebhook(
      "midtrans",
      event.order_id,
      event,
      event.signature_key,
      midtransEventId(event),
      event.transaction_status,
      (status === "capture" || status === "settlement") && fraud === "accept",
      status === "expire",
      parseMidtransAmount(event.gross_amount),
      event
    )
    if (result) return result
  }

  return processDirectWebhook(
    {
      provider: "midtrans",
      orderId: event.order_id,
      eventId: midtransEventId(event),
      eventType: event.transaction_status,
      amount: parseMidtransAmount(event.gross_amount),
      payload: event,
      signaturePayload: event,
      signature: event.signature_key,
      paid: (status === "capture" || status === "settlement") && fraud === "accept",
      expired: status === "expire",
      rejectReason:
        (status === "capture" || status === "settlement") && fraud !== "accept"
          ? "fraud_status tidak diterima"
          : status === "deny" || status === "cancel"
            ? "status Midtrans ditolak"
            : undefined,
      invalidEventId: invalidWebhookEventId(
        "midtrans",
        midtransEventId(event),
        event.signature_key
      ),
    },
    directWebhookDependencies()
  )
}

/** Tripay direct-merchant callback. `rawBody` is verified before any reserialization. */
export async function handleTripayWebhook(rawBody: string, signature: string | null) {
  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(rawBody)
  } catch {
    return { ok: false, reason: "invalid_payload" as const }
  }
  const parsed = tripayWebhookSchema.safeParse(rawPayload)
  if (!parsed.success || !signature) return { ok: false, reason: "invalid_payload" as const }
  const event = parsed.data
  const status = event.status.toUpperCase()

  // Branch invoice subscription: order_id bukan payment kiosk.
  const { data: kioskPayment } = await createServerClient()
    .from("payments")
    .select("id")
    .eq("order_id", event.merchant_ref)
    .maybeSingle()
  if (!kioskPayment) {
    const result = await handleDirectInvoiceWebhook(
      "tripay",
      event.merchant_ref,
      rawBody,
      signature,
      tripayEventId(event),
      event.status,
      status === "PAID",
      status === "EXPIRED",
      tripayWebhookAmount(event),
      event
    )
    if (result) return result
  }

  return processDirectWebhook(
    {
      provider: "tripay",
      orderId: event.merchant_ref,
      eventId: tripayEventId(event),
      eventType: event.status,
      amount: tripayWebhookAmount(event),
      payload: event,
      signaturePayload: rawBody,
      signature,
      paid: status === "PAID",
      expired: status === "EXPIRED",
      rejectReason:
        status === "FAILED" || status === "REFUND" ? "status Tripay ditolak" : undefined,
      invalidEventId: invalidWebhookEventId("tripay", tripayEventId(event), signature),
    },
    directWebhookDependencies()
  )
}

export type PakasirSecretResolution = {
  /** True bila order_id milik payment credential tenant (direct merchant). */
  hasCredential: boolean
  /** Secret per-credential terdekripsi; null bila credential tak punya/punya tapi kosong. */
  secret: string | null
}

/**
 * C2 (security): resolusi secret + flag kepemilikan credential.
 * Order tenant (hasCredential=true) TIDAK boleh fallback ke secret global
 * platform (H2). Panggil dengan credential harus punya secret; bila tidak →
 * webhook ditolak (fail-closed), bukan disettle dengan secret platform.
 */
export async function pakasirWebhookSecretResolution(
  orderId: string
): Promise<PakasirSecretResolution> {
  const supabase = createServerClient()
  const { data: payment } = await supabase
    .from("payments")
    .select("credential_id")
    .eq("order_id", orderId)
    .maybeSingle()
  let credentialId: string | null =
    ((payment ?? null) as { credential_id: string | null } | null)?.credential_id ?? null
  if (!credentialId) {
    const { data: invoicePayment } = await supabase
      .from("invoice_payments")
      .select("credential_id")
      .eq("order_id", orderId)
      .maybeSingle()
    credentialId =
      ((invoicePayment ?? null) as { credential_id: string | null } | null)?.credential_id ?? null
  }
  if (!credentialId) return { hasCredential: false, secret: null }
  const { data: credential } = await supabase
    .from("payment_credentials")
    .select("metadata")
    .eq("id", credentialId)
    .maybeSingle()
  const secretEncrypted = (credential?.metadata as Record<string, unknown> | null)
    ?.webhook_secret_encrypted
  if (typeof secretEncrypted !== "string" || secretEncrypted.length === 0) {
    return { hasCredential: true, secret: null }
  }
  return { hasCredential: true, secret: decrypt(secretEncrypted) }
}

export async function handlePakasirWebhook(rawPayload: unknown) {
  const parsed = pakasirWebhookSchema.safeParse(rawPayload)
  if (!parsed.success) {
    await logPaymentWebhook({
      eventId: `invalid-${randomUUID()}`,
      eventType: null,
      payload: rawPayload,
      signatureValid: null,
      status: "error",
      paymentId: null,
      error: "Payload tidak valid",
    })
    return { ok: false, reason: "invalid_payload" as const }
  }
  const event = parsed.data
  const mapped = pakasirMapStatus(event.status)

  const supabase = createServerClient()
  const { data: paymentRow } = await supabase
    .from("payments")
    .select("*")
    .eq("order_id", event.order_id)
    .maybeSingle()
  const payment = (paymentRow ?? null) as unknown as PaymentRow | null
  if (!payment) {
    // Branch pembayaran invoice subscription (order_id di invoice_payments).
    // Invoice subscription juga dibayar via Pakasir QRIS.
    const invoiceResult = await handleInvoiceWebhookEvent(
      {
        order_id: event.order_id,
        status: event.status,
        amount: event.amount != null ? parseProviderAmount(event.amount) : null,
        payment_date: pakasirEventTimestamp(event),
        signature: null, // Pakasir webhook tanpa signature; status diverifikasi server-to-server.
      },
      rawPayload
    )
    if (invoiceResult) return invoiceResult
    await logPaymentWebhook({
      eventId: pakasirWebhookEventId(event.order_id, event.status),
      eventType: event.status,
      payload: rawPayload,
      signatureValid: null,
      status: "ignored",
      paymentId: null,
      error: "order_id tidak dikenal",
    })
    return { ok: false, reason: "unknown_order" as const }
  }

  // Validasi amount bila provider mengirimnya (lihat pakasirKioskAmountValid:
  // v2 mengirim nominal DASAR, jadi final_amount ikut diterima).
  if (!pakasirKioskAmountValid(event.amount, payment)) {
    await logPaymentWebhook({
      eventId: pakasirWebhookEventId(event.order_id, event.status),
      eventType: event.status,
      payload: rawPayload,
      signatureValid: null,
      status: "error",
      paymentId: payment.id,
      error: "amount tidak cocok",
    })
    return { ok: false, reason: "amount_mismatch" as const }
  }

  // H2 freshness (anti replay/clock-skew): timestamp kejadian di luar jendela
  // → tolak. v2 mengirim `completed_at`, v1 `payment_date`.
  if (!isWebhookEventFresh(pakasirEventTimestamp(event), new Date(), parseProviderDateTime)) {
    await logPaymentWebhook({
      eventId: `${pakasirWebhookEventId(event.order_id, event.status)}:stale`,
      eventType: event.status,
      payload: rawPayload,
      signatureValid: null,
      status: "error",
      paymentId: payment.id,
      error: "Webhook di luar jendela freshness",
    })
    return { ok: false, reason: "stale" as const }
  }

  if (mapped === "paid") {
    // M3: provider getStatus bisa throw (outage/network) → JANGAN biarkan jadi
    // 500 generik tanpa konteks. Tangkap → unverified_status retryable:true
    // (route balas non-2xx agar provider retry; bukan settle buta).
    let verified = false
    try {
      verified = await verifyPakasirPaid(payment, {
        byCredential: resolveGatewayByCredential,
        aggregator: () => pakasirAggregatorGateway,
      })
    } catch (error) {
      console.error(
        "[webhook pakasir] verifyPakasirPaid gagal:",
        error instanceof Error ? error.message : String(error)
      )
      await logPaymentWebhook({
        eventId: `${pakasirWebhookEventId(event.order_id, event.status)}:unverified_error`,
        eventType: event.status,
        payload: rawPayload,
        signatureValid: null,
        status: "error",
        paymentId: payment.id,
        error: "Verifikasi status provider error",
      })
      return { ok: false, reason: "unverified_status" as const, retryable: true }
    }
    if (!verified) {
      await logPaymentWebhook({
        eventId: pakasirWebhookEventId(event.order_id, event.status),
        eventType: event.status,
        payload: rawPayload,
        signatureValid: null,
        status: "error",
        paymentId: payment.id,
        error: "Status paid tidak terverifikasi di Pakasir",
      })
      return { ok: false, reason: "unverified_status" as const }
    }
  }

  // Idempotency: sudah paid → ignore.
  if (payment.status === "paid") {
    await logPaymentWebhook({
      eventId: pakasirWebhookEventId(event.order_id, event.status),
      eventType: event.status,
      payload: rawPayload,
      // Pakasir tidak memakai signature → null ("tidak berlaku"), bukan true.
      signatureValid: null,
      status: "ignored",
      paymentId: payment.id,
      error: "Sudah paid (duplicate webhook)",
    })
    return { ok: true, reason: "already_paid" as const }
  }

  // H3 — klaim `received` sebelum settle; promote ke `processed` setelah sukses.
  // Status-aware: `received`/`error` tidak memblokir redelivery.
  const claimed = await claimWebhookEvent({
    eventId: pakasirWebhookEventId(event.order_id, event.status),
    eventType: event.status,
    payload: rawPayload,
    // Pakasir tidak memakai signature → null ("tidak berlaku"), bukan true.
    signatureValid: null,
    paymentId: payment.id,
  })
  if (claimed === "duplicate") {
    return { ok: true, reason: "duplicate_event" as const }
  }

  if (
    mapped === "paid" &&
    (await transitionPaymentToPaid(payment.id, ["creating", "pending", "expired"]))
  ) {
    const checkout = await loadCheckout(payment.business_id, payment.checkout_session_id)
    await runPaidSideEffects(payment, checkout)
    await promoteWebhookEvent({
      eventId: pakasirWebhookEventId(event.order_id, event.status),
      status: "processed",
      paymentId: payment.id,
    })
    return { ok: true, reason: "paid" as const }
  }
  if (mapped === "expired" && (await transitionPaymentToExpired(payment.id))) {
    await promoteWebhookEvent({
      eventId: pakasirWebhookEventId(event.order_id, event.status),
      status: "processed",
      paymentId: payment.id,
    })
    await createServerClient()
      .from("checkout_sessions")
      .update({ status: "expired" })
      .eq("id", payment.checkout_session_id)
      .eq("status", "open")
    return { ok: true, reason: "expired" as const }
  }
  return { ok: true, reason: "no_transition" as const }
}
