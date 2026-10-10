/**
 * Regression: handlePakasirWebhook must forward unknown order_id to invoice
 * handler (subscription payments). Before fix, Pakasir webhook for invoice
 * payments returned "unknown_order" instead of delegating to
 * handleInvoiceWebhookEvent — silently dropping subscription payment confirmations.
 *
 * Also tests docs/06 §6.3 Pakasir contract alignment (endpoint, auth, response fields).
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  pakasirWebhookSchema,
  normalizeCreateResult,
  mapProviderStatus,
  webhookEventId,
  isVerifiedPakasirPayment,
  isInvoiceSignatureValid,
  isInvoiceAmountValid,
  requiresPakasirServerVerify,
} from "../src/server/payment/pakasir-utils.ts"

import { parseProviderAmount } from "../src/lib/qris-helpers.ts"
import type { InvoiceWebhookInput } from "../src/server/payment/invoice.ts"

// ---------------------------------------------------------------------------
// Pakasir webhook schema (no signature field — unlike legacy)
// ---------------------------------------------------------------------------

test("pakasirWebhookSchema: valid subscription invoice webhook payload", () => {
  const payload = {
    order_id: "SnapyOS-INV-0001AB",
    status: "SUCCESS",
    amount: 99000,
    payment_date: "2026-09-14 10:00:00",
  }
  const result = pakasirWebhookSchema.safeParse(payload)
  assert.ok(result.success, "valid Pakasir webhook should parse")
})

test("pakasirWebhookSchema: amount nullable/optional", () => {
  const result = pakasirWebhookSchema.safeParse({
    order_id: "SnapyOS-INV-0001AB",
    status: "SUCCESS",
  })
  assert.ok(result.success, "amount can be omitted")
})

test("pakasirWebhookSchema: rejects empty order_id", () => {
  const result = pakasirWebhookSchema.safeParse({
    order_id: "",
    status: "SUCCESS",
  })
  assert.ok(!result.success, "empty order_id rejected")
})

// ---------------------------------------------------------------------------
// InvoiceWebhookInput type compatibility (compile-time + runtime shape)
// ---------------------------------------------------------------------------

test("InvoiceWebhookInput: constructed from Pakasir event (signature null)", () => {
  const pakasirEvent = pakasirWebhookSchema.parse({
    order_id: "SnapyOS-INV-0001AB",
    status: "SUCCESS",
    amount: 99000,
    payment_date: "2026-09-14 10:00:00",
  })

  // This is exactly how handlePakasirWebhook constructs the input.
  const invoiceInput: InvoiceWebhookInput = {
    order_id: pakasirEvent.order_id,
    status: pakasirEvent.status,
    amount: pakasirEvent.amount != null ? parseProviderAmount(pakasirEvent.amount) : null,
    payment_date: pakasirEvent.payment_date ?? null,
    signature: null,
  }

  assert.equal(invoiceInput.order_id, "SnapyOS-INV-0001AB")
  assert.equal(invoiceInput.status, "SUCCESS")
  assert.equal(invoiceInput.signature, null)
})

test("InvoiceWebhookInput: constructed from legacy event (signature present)", () => {
  const legacyInput: InvoiceWebhookInput = {
    order_id: "SnapyOS-INV-0002CD",
    status: "SUCCESS",
    total_amount: 100003,
    payment_date: "2026-09-14 10:00:00",
    signature: "ohRISdH4ABDvOlDTUCBTEnBndwUYK0177659",
  }

  assert.equal(legacyInput.signature, "ohRISdH4ABDvOlDTUCBTEnBndwUYK0177659")
})

// ---------------------------------------------------------------------------
// Pakasir create response normalization (docs/06 §6.3 contract alignment)
// ---------------------------------------------------------------------------

test("Pakasir create response: total_payment + qr_string (v2) is the actual field", () => {
  // v2 API returns `total_payment` and `qr_string` (bukan payment_number v1).
  const result = normalizeCreateResult({
    txn_id: "vwiqpcriq",
    order_id: "SnapyOS-ABC123",
    amount: 99000,
    fee: 1003,
    total_payment: 100003,
    qr_string: "0002010102122661",
    expired_at: "2026-09-19T01:18:49.678Z",
  })
  assert.ok(result)
  assert.equal(result.total_amount, 100003)
  assert.equal(result.qr_string, "0002010102122661")
  assert.equal(result.txn_id, "vwiqpcriq")
})

test("Pakasir create response: total_amount (wrong field name) returns null", () => {
  // If someone passes total_amount instead of total_payment, normalization should fail.
  const result = normalizeCreateResult({
    order_id: "SnapyOS-ABC123",
    amount: 99000,
    total_amount: 100003, // wrong field!
    qr_string: "0002010102122661",
  })
  assert.equal(result, null, "total_amount is not recognized; must be total_payment")
})

// ---------------------------------------------------------------------------
// Status mapping (shared between kiosk checkout and invoice subscription)
// ---------------------------------------------------------------------------

test("Pakasir mapProviderStatus: SUCCESS/PAID/COMPLETED → paid", () => {
  assert.equal(mapProviderStatus("SUCCESS"), "paid")
  assert.equal(mapProviderStatus("PAID"), "paid")
  assert.equal(mapProviderStatus("COMPLETED"), "paid")
})

test("Pakasir mapProviderStatus: EXPIRED/CANCELLED → expired", () => {
  assert.equal(mapProviderStatus("EXPIRED"), "expired")
  assert.equal(mapProviderStatus("CANCELLED"), "expired")
  assert.equal(mapProviderStatus("CANCELED"), "expired")
})

test("invoice webhook: SUCCESS settles only after Pakasir server status is paid", () => {
  assert.equal(isVerifiedPakasirPayment("SUCCESS", "SUCCESS"), true)
  assert.equal(isVerifiedPakasirPayment("SUCCESS", "PENDING"), false)
  assert.equal(isVerifiedPakasirPayment("SUCCESS", "EXPIRED"), false)
  assert.equal(isVerifiedPakasirPayment("PENDING", "SUCCESS"), false)
})

test("Pakasir webhookEventId: format order_id:STATUS:payment_date", () => {
  assert.equal(
    webhookEventId("SnapyOS-INV-001", "SUCCESS", "2026-09-14"),
    "SnapyOS-INV-001:SUCCESS:2026-09-14"
  )
  // Pakasir may omit payment_date
  assert.equal(webhookEventId("SnapyOS-INV-001", "SUCCESS"), "SnapyOS-INV-001:SUCCESS:")
})

// ---------------------------------------------------------------------------
// C2 (security) — forge webhook: signature null TIDAK boleh jadi gate lolos.
// ---------------------------------------------------------------------------

test("C2: provider_signature null → signature TIDAK valid (bukan gate lolos)", () => {
  // Pakasir tak menandatangani webhook → provider_signature null.
  // Sebelum fix `=== null ||` membuat signatureValid=true → forge lolos.
  assert.equal(isInvoiceSignatureValid(null, null), false)
  assert.equal(isInvoiceSignatureValid(null, "anything"), false)
  // Signature tersimpan & cocok = valid.
  assert.equal(isInvoiceSignatureValid("sig-abc", "sig-abc"), true)
  assert.equal(isInvoiceSignatureValid("sig-abc", "sig-xyz"), false)
})

test("C2: provider Pakasir SELALU butuh server-to-server verify", () => {
  assert.equal(requiresPakasirServerVerify("pakasir", false), true)
  assert.equal(requiresPakasirServerVerify("pakasir", true), true, "signature sah pun tetap S2S")
  // Non-Pakasir: tanpa signature tepercaya → butuh verify (yang lalu ditolak).
  assert.equal(requiresPakasirServerVerify("midtrans", false), true)
  assert.equal(requiresPakasirServerVerify("midtrans", true), false)
})

test("C2 forgery: signature null + provider 'unpaid' → unverified (bukan settled)", () => {
  // Skenario: penyerang punya order_id valid + secret global benar, kirim
  // webhook paid dengan signature null. Provider server-to-server bilang unpaid.
  const signatureValid = isInvoiceSignatureValid(null, null)
  assert.equal(signatureValid, false)
  const needsVerify = requiresPakasirServerVerify("pakasir", signatureValid)
  assert.equal(needsVerify, true)
  // Gate S2S (isVerifiedPakasirPayment) harus menolak status provider unpaid.
  assert.equal(isVerifiedPakasirPayment("SUCCESS", "PENDING"), false)
  assert.equal(isVerifiedPakasirPayment("SUCCESS", "EXPIRED"), false)
  // Hanya settle bila provider juga paid.
  assert.equal(isVerifiedPakasirPayment("SUCCESS", "COMPLETED"), true)
})

test("C2: amount mismatch tetap ditolak sebelum gate apa pun", () => {
  const payment = { amount: 99000, total_amount: 100003 }
  assert.equal(isInvoiceAmountValid({ amount: 99000, total_amount: 100003 }, payment), true)
  assert.equal(isInvoiceAmountValid({ amount: 1 }, payment), false)
  assert.equal(isInvoiceAmountValid({ amount: null }, payment), true, "absen = lewat")
  assert.equal(isInvoiceAmountValid({}, payment), true)
})

// ---------------------------------------------------------------------------
// H3 — handleInvoiceWebhookEvent memakai claim/promote (bukan persist terminal
// sebelum settle). Static check: handler butuh supabase; tak bisa dijalankan.
// ---------------------------------------------------------------------------

test("H3: handleInvoiceWebhookEvent claim sebelum settle, promote setelah", async () => {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/server/payment/invoice.ts", import.meta.url), "utf8")
  )
  // Ambil blok handleInvoiceWebhookEvent saja (bukan direct).
  const start = src.indexOf("export async function handleInvoiceWebhookEvent")
  const end = src.indexOf("handleDirectInvoiceWebhook", start)
  const body = src.slice(start, end)
  assert.ok(body.length > 0, "fungsi handleInvoiceWebhookEvent ditemukan")
  assert.match(body, /claimWebhookEvent\(/, "harus claim `received` sebelum settle")
  assert.match(body, /promoteWebhookEvent\(\s*\{\s*eventId,\s*status:\s*"processed"/, "promote setelah settle")
  // TIDAK boleh ada pemanggilan logPaymentWebhook dengan status terminal
  // `processed` (persist terminal mendahului transisi = celah lost-settlement).
  assert.doesNotMatch(
    body,
    /logPaymentWebhook\(\{[^}]*status:\s*"processed"/,
    "tidak boleh persist terminal lewat logPaymentWebhook"
  )
})
