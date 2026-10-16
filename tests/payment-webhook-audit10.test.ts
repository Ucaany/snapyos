/**
 * Regression §10 (audit pembayaran & webhook): dua bug settlement yang
 * terverifikasi terhadap dokumentasi provider live:
 *
 * L) Pakasir v2 mengirim nominal DASAR (`amount`) di body webhook, bukan
 *    `total_payment`. Gate lama hanya menerima `total_amount` (base + fee)
 *    sehingga setiap payment Pakasir dengan fee != 0 ditolak `amount_mismatch`.
 * M) Callback Tripay TIDAK mengirim `amount`; nominalnya ada di `total_amount`.
 *    Schema lama mewajibkan `amount` → SETIAP callback asli ditolak
 *    `invalid_payload` dan tidak pernah settle.
 *
 * Plus kontrak yang berubah: timestamp kejadian v2 (`completed_at`), serializer
 * `paymentResponse` (status `expired` + konvensi `qr_image`/`qr_url`).
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  pakasirWebhookSchema,
  pakasirEventTimestamp,
  pakasirKioskAmountValid,
} from "../src/server/payment/pakasir-utils.ts"
import {
  tripayWebhookSchema,
  tripayWebhookAmount,
  tripayEventId,
  parseTripayAmount,
} from "../src/server/payment/tripay-utils.ts"
import { paymentResponse } from "../src/server/payment/payment-response.ts"
import { encodeKioskPaymentPayload } from "../src/server/payment/kiosk-payment.ts"
import type { PaymentRow } from "../src/server/payment/checkout-shared.ts"

// ---------------------------------------------------------------------------
// L: gate nominal Pakasir kiosk (nominal dasar vs total)
// ---------------------------------------------------------------------------

test("Pakasir kiosk amount: nominal DASAR webhook v2 diterima", () => {
  // create-transaction: amount 99000 + fee 1003 → total_payment 100003.
  // payments.total_amount menyimpan 100003; webhook mengirim 99000.
  const payment = { final_amount: 99000, total_amount: 100003 }
  assert.equal(pakasirKioskAmountValid(99000, payment), true, "amount dasar = final_amount")
  assert.equal(pakasirKioskAmountValid(100003, payment), true, "total = total_amount")
  assert.equal(pakasirKioskAmountValid("99000", payment), true, "string provider")
  assert.equal(pakasirKioskAmountValid(99001, payment), false, "nilai lain ditolak")
  assert.equal(pakasirKioskAmountValid("abc", payment), false, "tak bisa diparse ditolak")
  assert.equal(pakasirKioskAmountValid(undefined, payment), true, "field absen = lewat")
  assert.equal(pakasirKioskAmountValid(null, payment), true, "null = lewat")
})

test("Pakasir kiosk amount: total_amount null → fallback final_amount", () => {
  const payment = { final_amount: 50000, total_amount: null }
  assert.equal(pakasirKioskAmountValid(50000, payment), true)
  assert.equal(pakasirKioskAmountValid(0, payment), false)
})

// ---------------------------------------------------------------------------
// N: timestamp kejadian v2
// ---------------------------------------------------------------------------

test("Pakasir event timestamp: completed_at diutamakan, payment_date fallback", () => {
  assert.equal(
    pakasirEventTimestamp({ completed_at: "2026-10-01T01:18:49.678Z", payment_date: "2026-10-01 08:18:49" }),
    "2026-10-01T01:18:49.678Z"
  )
  assert.equal(
    pakasirEventTimestamp({ completed_at: null, payment_date: "2026-10-01 08:18:49" }),
    "2026-10-01 08:18:49"
  )
  assert.equal(pakasirEventTimestamp({}), null)
})

test("Pakasir webhook schema menerima payload v2 (completed_at, tanpa payment_date)", () => {
  const parsed = pakasirWebhookSchema.safeParse({
    txn_id: "vwiqpcriq",
    order_id: "INV123123",
    amount: 99000,
    is_sandbox: false,
    status: "completed",
    completed_at: "2025-09-19T01:18:49.678622564Z",
  })
  assert.equal(parsed.success, true)
})

// ---------------------------------------------------------------------------
// M: callback Tripay nyata (tanpa `amount`)
// ---------------------------------------------------------------------------

/** Body callback Tripay apa adanya (developer docs, transaction-create). */
const TRIPAY_CALLBACK = {
  reference: "T1234567890",
  merchant_ref: "SnapyOS-ABC123",
  payment_method: "QRIS",
  payment_method_code: "QRIS",
  total_amount: 100003,
  fee_merchant: 1000,
  fee_customer: 1003,
  total_fee: 2003,
  amount_received: 99000,
  is_closed_payment: 1,
  status: "PAID",
  paid_at: 1789000000,
  note: null,
}

test("Tripay: callback asli (tanpa `amount`) lolos schema", () => {
  const parsed = tripayWebhookSchema.safeParse(TRIPAY_CALLBACK)
  assert.equal(parsed.success, true, "callback tanpa `amount` harus diterima")
  assert.equal(tripayWebhookAmount(parsed.data!), 100003)
})

test("Tripay: schema menolak payload tanpa nominal sama sekali", () => {
  const { total_amount: _drop, ...withoutAmount } = TRIPAY_CALLBACK
  assert.equal(tripayWebhookSchema.safeParse(withoutAmount).success, false)
  assert.equal(tripayWebhookSchema.safeParse({ merchant_ref: "X", status: "PAID" }).success, false)
})

test("Tripay: `amount` tetap dipakai bila total_amount absen", () => {
  const parsed = tripayWebhookSchema.safeParse({
    merchant_ref: "SnapyOS-ABC123",
    status: "PAID",
    amount: "50000",
  })
  assert.equal(parsed.success, true)
  assert.equal(tripayWebhookAmount(parsed.data!), 50000)
})

test("parseTripayAmount: desimal diterima, sampah ditolak", () => {
  assert.equal(parseTripayAmount("1016.00"), 1016)
  assert.equal(parseTripayAmount(1016), 1016)
  assert.equal(parseTripayAmount("1.234.567"), 1234567, ">1 titik = pemisah ribuan")
  assert.equal(parseTripayAmount("1.000"), 1, "satu titik = titik desimal (ambigu, didokumentasikan)")
  assert.equal(parseTripayAmount("abc"), null)
  assert.equal(parseTripayAmount(null), null)
  assert.equal(parseTripayAmount(-1), null)
})

test("Tripay event id: memakai nominal teresolusi, bukan field `amount`", () => {
  const parsed = tripayWebhookSchema.parse(TRIPAY_CALLBACK)
  const id = tripayEventId(parsed)
  assert.equal(id, "tripay:SnapyOS-ABC123:T1234567890:PAID:100003")
  // Status beda → event id beda (dua event sah untuk satu transaksi).
  assert.notEqual(id, tripayEventId({ ...parsed, status: "EXPIRED" }))
})

// ---------------------------------------------------------------------------
// I + A: serializer payment kiosk
// ---------------------------------------------------------------------------

function paymentRow(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "pay-1",
    business_id: "biz-1",
    checkout_session_id: "checkout-1",
    outlet_id: null,
    photobox_id: null,
    package_id: null,
    gross_amount: 50000,
    discount_amount: 0,
    voucher_id: null,
    final_amount: 50000,
    order_id: "SnapyOS-ABC123",
    amount_uniq: 3,
    total_amount: 50003,
    provider: "pakasir",
    payment_reference: "ref-1",
    status: "pending",
    transaction_id: null,
    qr_string: null,
    expires_at: "2026-10-01T02:00:00.000Z",
    credential_id: "cred-1",
    provider_ref: "vwiqpcriq",
    ...overrides,
  }
}

const QRIS_PAYLOAD = encodeKioskPaymentPayload({
  display: "qris",
  method: "qris",
  qrString: "0002010102122661",
  qrImageUrl: null,
  paymentUrl: null,
  vaNumber: null,
})

test("paymentResponse: status `expired` diteruskan (bukan dikolapskan ke pending)", () => {
  assert.equal(paymentResponse(paymentRow({ status: "pending" })).status, "pending")
  assert.equal(paymentResponse(paymentRow({ status: "paid" })).status, "paid")
  assert.equal(paymentResponse(paymentRow({ status: "expired" })).status, "expired")
  assert.equal(paymentResponse(paymentRow({ status: "failed" })).status, "pending")
})

test("paymentResponse: qr_image = QRIS mentah, qr_url = tautan gambar http", () => {
  const raw = paymentResponse(paymentRow({ qr_string: QRIS_PAYLOAD }))
  assert.equal(raw.qr_image, "0002010102122661", "qr_image memuat string QRIS mentah")
  assert.equal(raw.qr_url, null, "tanpa URL gambar → qr_url null")
  assert.equal(raw.qr_string, "0002010102122661")

  const url = paymentResponse(paymentRow({ provider: "tripay" }), {
    display: "qris",
    method: "QRIS",
    qrString: null,
    qrImageUrl: "https://tripay.co.id/qr/abc.png",
    paymentUrl: null,
    vaNumber: null,
  })
  assert.equal(url.qr_image, "https://tripay.co.id/qr/abc.png", "tanpa QR mentah → qr_image = gambar")
  assert.equal(url.qr_url, "https://tripay.co.id/qr/abc.png")
})

test("paymentResponse: total_amount fallback ke final_amount bila kolom null", () => {
  const row = paymentResponse(paymentRow({ final_amount: 50000, total_amount: null }))
  assert.equal(row.amount, 50000)
  assert.equal(row.total_amount, 50000)
})
