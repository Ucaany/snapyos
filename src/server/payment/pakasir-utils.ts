/**
 * Pakasir webhook & response utilities (pure — no runtime deps).
 * Dipindah dari `src/lib/pakasir.ts` (Fase 5). Semua konsumen adalah kode
 * server (webhook-handler, invoice, pakasir provider); dipertahankan sebagai
 * modul terpisah supaya bisa dites tanpa Next runtime.
 * Docs: https://pakasir.com/p/docs (Callback / Transaction Detail).
 */

import { timingSafeEqual } from "node:crypto"
import { z } from "zod"
import type { GatewayStatus } from "./providers/types"
import { parseProviderAmount } from "../../lib/qris-helpers.ts"
export { parseProviderDateTime } from "../../lib/qris-helpers.ts"

export const pakasirWebhookSchema = z.object({
  order_id: z.string().trim().min(1).max(120),
  txn_id: z.string().trim().min(1).max(120).nullable().optional(),
  status: z.string().trim().min(1).max(40),
  amount: z.union([z.string(), z.number()]).nullable().optional(),
  payment_date: z.string().trim().max(80).nullable().optional(),
  completed_at: z.string().trim().max(80).nullable().optional(),
})

export type PakasirWebhookPayload = z.infer<typeof pakasirWebhookSchema>

export type PakasirCreateResult = {
  order_id: string
  txn_id: string
  amount: number
  total_amount: number
  qr_string: string
  expired_at: string | null
}

export function normalizeCreateResult(value: unknown): PakasirCreateResult | null {
  if (!value || typeof value !== "object") return null
  const payment = value as Record<string, unknown>
  const orderId = typeof payment.order_id === "string" ? payment.order_id.trim() : ""
  const txnId = typeof payment.txn_id === "string" ? payment.txn_id.trim() : ""
  // v2: qr_string (bukan payment_number v1).
  const qrString = typeof payment.qr_string === "string" ? payment.qr_string.trim() : ""
  const amount = typeof payment.amount === "number" ? payment.amount : Number.NaN
  const totalAmount = typeof payment.total_payment === "number" ? payment.total_payment : Number.NaN
  if (
    !orderId ||
    !qrString ||
    !Number.isInteger(amount) ||
    amount < 0 ||
    !Number.isInteger(totalAmount) ||
    totalAmount < amount
  ) {
    return null
  }
  return {
    order_id: orderId,
    txn_id: txnId,
    amount,
    total_amount: totalAmount,
    qr_string: qrString,
    expired_at:
      typeof payment.expired_at === "string" && payment.expired_at ? payment.expired_at : null,
  }
}

/**
 * Map status provider → status internal payment.
 * KANONIKAL (toleran): v2 mengirim completed/canceled (kecil) — normalisasi
 * ke uppercase + tetap toleran status lama (SUCCESS/PAID/COMPLETED) untuk
 * backward-compat legacy in-flight. docs v2: pending|completed|canceled.
 */
export function mapProviderStatus(status: unknown): "pending" | "paid" | "expired" | null {
  const value = typeof status === "string" ? status.trim().toUpperCase() : ""
  if (["SUCCESS", "PAID", "COMPLETED"].includes(value)) return "paid"
  if (["PENDING", "UNPAID"].includes(value)) return "pending"
  if (["EXPIRED", "CANCELLED", "CANCELED"].includes(value)) return "expired"
  return null
}

/** Callback Pakasir bukan bukti pembayaran; status provider wajib ikut paid. */
export function isVerifiedPakasirPayment(
  callbackStatus: unknown,
  providerStatus: unknown
): boolean {
  return (
    mapProviderStatus(callbackStatus) === "paid" && mapProviderStatus(providerStatus) === "paid"
  )
}

/**
 * Timestamp kejadian webhook Pakasir: v2 mengirim `completed_at` (ISO-8601 Z),
 * v1 mengirim `payment_date`. Dipakai untuk freshness H2 dan event id.
 */
export function pakasirEventTimestamp(event: {
  completed_at?: string | null
  payment_date?: string | null
}): string | null {
  return event.completed_at ?? event.payment_date ?? null
}

/**
 * Gate nominal webhook Pakasir kiosk (murni, fail-closed).
 *
 * Pakasir v2 mengirim nominal DASAR (`amount`) di body webhook maupun
 * transaction-status; hanya `create-transaction` yang mengembalikan `fee` dan
 * `total_payment`. Karena `payments.total_amount` menyimpan base + fee, gate
 * harus menerima salah satu dari dua nilai yang tercatat:
 * - `final_amount`  → nominal dasar yang diminta ke customer
 * - `total_amount`  → nominal dasar + fee (bila provider mengirim totalnya)
 * Field absen = lewat (S2S tetap gate utama); ada tapi tak bisa diparse atau
 * bukan salah satu nilai itu = tolak. Tanpa rentang/ambang.
 */
export function pakasirKioskAmountValid(
  eventAmount: unknown,
  payment: { final_amount: number; total_amount: number | null }
): boolean {
  if (eventAmount === undefined || eventAmount === null) return true
  const parsed = parseProviderAmount(eventAmount)
  if (parsed === null) return false
  return parsed === payment.final_amount || parsed === (payment.total_amount ?? payment.final_amount)
}

/**
 * Verifikasi status paid server-to-server dengan gateway yang JAHIT payment:
 * - payment.credential_id (direct merchant owner) → byCredential(id) → verifikasi
 *   di project owner. Credential dihapus sebelum webhook → false (fail-closed;
 *   query project platform = verifikasi project yang salah → risiko settle false).
 * - credential_id null (legacy aggregator, backward compat) → aggregator() (env var platform).
 *   Sejak 2026-09-18 kiosk tidak lagi membuat payment lewat aggregator; cabang ini
 *   dipertahankan fail-closed untuk payment legacy in-flight saja.
 */
export async function verifyPakasirPaid(
  payment: { credential_id: string | null; order_id: string; final_amount: number; provider_ref?: string | null },
  gateways: {
    byCredential: (credentialId: string) => Promise<{ getStatus: (orderId: string, amount?: number, providerRef?: string | null) => Promise<GatewayStatus> } | null>
    aggregator: () => { getStatus: (orderId: string, amount?: number, providerRef?: string | null) => Promise<GatewayStatus> }
  }
): Promise<boolean> {
  const gateway = payment.credential_id
    ? await gateways.byCredential(payment.credential_id)
    : gateways.aggregator()
  if (!gateway) return false
  return (await gateway.getStatus(payment.order_id, payment.final_amount, payment.provider_ref ?? null)) === "paid"
}

export function webhookEventId(
  orderId: string,
  status: string,
  paymentDate?: string | null
): string {
  return `${orderId}:${status.toUpperCase()}:${paymentDate ?? ""}`
}

/**
 * C2/H2 — resolusi secret webhook untuk otorisasi route.
 * Order tenant (hasCredential) WAJIB punya secret per-credential; TANPA fallback
 * ke secret global platform. Non-tenant boleh pakai secret global.
 * Return null = ditolak; string = secret yang harus dicocokkan (boleh "").
 */
export function resolvePakasirExpectedSecret(input: {
  hasCredential: boolean
  secret: string | null
  globalSecret: string | null | undefined
}): { reject: boolean; expected: string } {
  if (input.hasCredential) {
    return input.secret ? { reject: false, expected: input.secret } : { reject: true, expected: "" }
  }
  return { reject: false, expected: (input.globalSecret ?? "").trim() }
}

/**
 * C2 (security) — gate settlement webhook invoice (murni, tanpa DB).
 * Signature hanya valid bila provider_signature TERSIMPAN dan cocok. Pakasir
 * selalu null → "signature valid" bukan gate; WAJIB server-to-server.
 */
export function isInvoiceSignatureValid(
  providerSignature: string | null,
  eventSignature: string | null | undefined
): boolean {
  return providerSignature !== null && eventSignature === providerSignature
}

/** Provider Pakasir ATAU signature tak tepercaya → wajib server-to-server verify. */
export function requiresPakasirServerVerify(provider: string, signatureValid: boolean): boolean {
  return provider === "pakasir" || !signatureValid
}

/** Default jendela freshness webhook (jam). */
export const WEBHOOK_FRESHNESS_HOURS = 24

/**
 * H2 — freshness: tolak webhook dengan payment_date di luar jendela
 * (masa lalu terlalu jauh atau masa depan mencurigakan). payment_date null =
 * lewat (provider tak mengirim timestamp; S2S tetap gate utama).
 * Murni; parseProviderDateTime disuntik agar tetap testable.
 */
export function isWebhookEventFresh(
  paymentDate: string | null | undefined,
  now: Date,
  parse: (value: string) => string | null,
  windowHours: number = WEBHOOK_FRESHNESS_HOURS
): boolean {
  if (!paymentDate) return true
  const iso = parse(paymentDate)
  if (!iso) return true
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return true
  const deltaMs = Math.abs(now.getTime() - t)
  return deltaMs <= windowHours * 3_600_000
}

/** Amount webhook cocok (field absen = lewat; ada tapi beda = tolak). */
export function isInvoiceAmountValid(
  event: { amount?: number | null; total_amount?: number | null },
  payment: { amount: number; total_amount: number | null }
): boolean {
  return (
    (event.amount === undefined || event.amount === null || event.amount === payment.amount) &&
    (event.total_amount === undefined ||
      event.total_amount === null ||
      event.total_amount === payment.total_amount)
  )
}

/**
 * Verifikasi header X-Secret (Pakasir v2) — timing-safe.
 * Fail-closed: expected kosong → false. Boleh dipakai untuk credential owner
 * (metadata.webhook_secret_encrypted) maupun env aggregator (PAKASIR_WEBHOOK_SECRET).
 */
export function verifyPakasirWebhookSecret(
  received: string | null | undefined,
  expected: string | null | undefined
): boolean {
  const receivedValue = received?.trim() ?? ""
  const expectedValue = expected?.trim() ?? ""
  if (!expectedValue || !receivedValue) return false
  const a = Buffer.from(receivedValue)
  const b = Buffer.from(expectedValue)
  return a.length === b.length && timingSafeEqual(a, b)
}
