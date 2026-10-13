/**
 * Phase 4/5 unit checks — pay-first checkout & Pakasir QRIS.
 * Mencakup: parsing nominal provider ("1016.00" → 1016), normalisasi create,
 * datetime WIB, schema webhook, matematika voucher/platform fee, order id.
 * Run: npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  buildOrderId,
  normalizeCreateResult,
  parseProviderAmount,
  parseProviderDateTime,
} from "../src/lib/qris-helpers.ts"
import {
  mapProviderStatus,
  normalizeCreateResult as normalizePakasirCreateResult,
  parseProviderDateTime as parsePakasirDateTime,
} from "../src/server/payment/pakasir-utils.ts"
import {
  computeFinalAmount,
  computePlatformFee,
  computeVoucherDiscount,
} from "../src/lib/checkout-math.ts"
import { buildCheckoutPayload, mergeCheckout } from "../src/lib/form-state.ts"
import {
  checkoutCreateSchema,
  checkoutSettingsSchema,
  paymentCreateSchema,
  sessionCreateSchema,
  transactionListQuerySchema,
} from "../src/lib/validators.ts"
import {
  clampQrisExpiryMinutes,
  computeQrisExpiresAt,
  DEFAULT_QRIS_EXPIRY_MINUTES,
} from "../src/lib/session-timer.ts"

// --- parsing nominal provider (string desimal → integer IDR, docs/06 §6.3) ---
test("parseProviderAmount: string desimal, angka, dan format kacau", () => {
  assert.equal(parseProviderAmount("1016.00"), 1016)
  assert.equal(parseProviderAmount("1000.00"), 1000)
  assert.equal(parseProviderAmount(1016), 1016)
  assert.equal(parseProviderAmount(1016.4), 1016)
  assert.equal(parseProviderAmount("0.00"), 0)
  assert.equal(parseProviderAmount(null), null)
  assert.equal(parseProviderAmount("abc"), null)
  assert.equal(parseProviderAmount(-5), null)
})

test("parseProviderDateTime: format WIB provider → ISO", () => {
  const iso = parseProviderDateTime("2026-08-19 10:34:11")
  assert.equal(iso, "2026-08-19T03:34:11.000Z") // 10:34 WIB = 03:34 UTC
  assert.equal(parseProviderDateTime("2026-08-19T10:34:11"), "2026-08-19T03:34:11.000Z")
  assert.equal(parseProviderDateTime("2026-09-15T16:10:15Z"), "2026-09-15T16:10:15.000Z")
  assert.equal(parseProviderDateTime("2026-09-15T16:10:15.715Z"), "2026-09-15T16:10:15.715Z")
  assert.equal(parseProviderDateTime("2026-09-15T23:10:15+07:00"), "2026-09-15T16:10:15.000Z")
  assert.equal(parseProviderDateTime("bukan-tanggal"), null)
  assert.equal(parseProviderDateTime(null), null)
})

test("buildOrderId + mapProviderStatus", () => {
  assert.equal(buildOrderId("abc123def456"), "SnapyOS-ABC123DEF456")
  assert.equal(mapProviderStatus("SUCCESS"), "paid")
  assert.equal(mapProviderStatus("PAID"), "paid")
  assert.equal(mapProviderStatus("PENDING"), "pending")
  assert.equal(mapProviderStatus("EXPIRED"), "expired")
  assert.equal(mapProviderStatus("??"), null)
})

// --- normalisasi response POST /qris/create (sample dokumentasi) ---
test("normalizeCreateResult: sample response provider", () => {
  const result = normalizeCreateResult({
    order_id: "INV-123",
    amount_uniq: "16.00",
    amount: "1000.00",
    total_amount: "1016.00",
    status: "PENDING",
    qris_url: "https://app.pakasir.com/storage/qris/qris_INV-123.png",
    expired_at: "2026-08-19 10:34:11",
    signature: "ohRISdH4ABDvOlDTUCBTEnBndwUYK0177659",
    qris_image: "data:image/png;base64,iVBORw0KGgoAAAA...",
  })
  assert.ok(result)
  assert.equal(result.order_id, "INV-123")
  assert.equal(result.amount, 1000)
  assert.equal(result.amount_uniq, 16)
  assert.equal(result.total_amount, 1016)
  assert.equal(result.status, "PENDING")
  assert.ok(result.qris_image?.startsWith("data:image"))
  assert.ok(result.expired_at)

  // Field wajib hilang → null.
  assert.equal(normalizeCreateResult({ order_id: "X", amount: "1.00" }), null)
  assert.equal(normalizeCreateResult({}), null)
})

test("normalizeCreateResult: response Pakasir v2 dan waktu ISO", () => {
  const result = normalizePakasirCreateResult({
    txn_id: "vwiqpcriq",
    order_id: "SnapyOS-ABC123",
    amount: 99000,
    fee: 1003,
    total_payment: 100003,
    qr_string: "0002010102122661",
    expired_at: "2026-09-19T01:18:49.678Z",
  })
  assert.deepEqual(result, {
    order_id: "SnapyOS-ABC123",
    txn_id: "vwiqpcriq",
    amount: 99000,
    total_amount: 100003,
    qr_string: "0002010102122661",
    expired_at: "2026-09-19T01:18:49.678Z",
  })
  assert.equal(parsePakasirDateTime(result?.expired_at), "2026-09-19T01:18:49.678Z")
  assert.equal(normalizePakasirCreateResult({ order_id: "X" }), null)
})

// --- matematika voucher (docs/06 §6.2/§6.5 — uang integer) ---
test("computeVoucherDiscount: percentage, fixed, cap max_discount, cap gross", () => {
  assert.equal(
    computeVoucherDiscount({
      gross_amount: 35000,
      type: "percentage",
      amount: 10,
      max_discount: null,
    }),
    3500
  )
  assert.equal(
    computeVoucherDiscount({
      gross_amount: 35000,
      type: "percentage",
      amount: 50,
      max_discount: 10000,
    }),
    10000
  )
  assert.equal(
    computeVoucherDiscount({ gross_amount: 5000, type: "fixed", amount: 7000, max_discount: null }),
    5000 // tidak melebihi gross
  )
  assert.equal(
    computeVoucherDiscount({
      gross_amount: 999,
      type: "percentage",
      amount: 33,
      max_discount: null,
    }),
    329 // floor, bukan round
  )
})

test("computeFinalAmount + computePlatformFee", () => {
  assert.equal(computeFinalAmount(35000, 3500), 31500)
  assert.equal(computeFinalAmount(35000, 40000), 0)
  assert.equal(computePlatformFee(31500, 0, 0), 0)
  assert.equal(computePlatformFee(31500, 2, 0), 630)
  assert.equal(computePlatformFee(31500, 2, 500), 1130)
  // fee tidak melebihi final
  assert.equal(computePlatformFee(1000, 100, 0), 1000)
})

// --- validator checkout pay-first (docs/08 §8.14) ---
test("checkoutCreateSchema + paymentCreateSchema + sessionCreateSchema pay-first", () => {
  const token = "a".repeat(64)
  const uuid = "00000000-0000-4000-8000-000000000000"
  assert.equal(
    checkoutCreateSchema.safeParse({ package_id: uuid, device_token: token }).success,
    true
  )
  // voucher_code dinormalisasi ke uppercase
  const parsed = checkoutCreateSchema.parse({
    package_id: uuid,
    voucher_code: "hemat10",
    device_token: token,
  })
  assert.equal(parsed.voucher_code, "HEMAT10")
  assert.equal(checkoutCreateSchema.safeParse({ device_token: token }).success, false)

  assert.equal(
    paymentCreateSchema.safeParse({
      checkout_session_id: uuid,
      device_token: token,
      method_id: "pakasir:qris",
    }).success,
    true
  )
  assert.equal(
    paymentCreateSchema.safeParse({ device_token: token, method_id: "pakasir:qris" }).success,
    false
  )
  assert.equal(
    paymentCreateSchema.safeParse({
      checkout_session_id: uuid,
      device_token: token,
      method_id: "pakasir:qris",
      amount: 1,
      provider: "midtrans",
      total_amount: 1,
    }).success,
    true
  )

  assert.equal(
    sessionCreateSchema.safeParse({ checkout_session_id: uuid, device_token: token }).success,
    true
  )
  assert.equal(
    sessionCreateSchema.safeParse({ package_id: uuid, device_token: token }).success,
    true
  )
})

// --- expiry QRIS owner-configurable, default 3 menit (docs/06 §6.3) ---
test("clampQrisExpiryMinutes: default 3, rentang 1–60", () => {
  assert.equal(DEFAULT_QRIS_EXPIRY_MINUTES, 3)
  assert.equal(clampQrisExpiryMinutes(null), 3)
  assert.equal(clampQrisExpiryMinutes(undefined), 3)
  assert.equal(clampQrisExpiryMinutes(NaN), 3)
  assert.equal(clampQrisExpiryMinutes(0), 1)
  assert.equal(clampQrisExpiryMinutes(-5), 1)
  assert.equal(clampQrisExpiryMinutes(5), 5)
  assert.equal(clampQrisExpiryMinutes(120), 60)
})

test("computeQrisExpiresAt: min(provider, setting owner)", () => {
  const now = Date.parse("2026-08-19T03:00:00.000Z")
  // Tanpa provider → kap setting (default 3 menit).
  assert.equal(computeQrisExpiresAt(null, null, now), "2026-08-19T03:03:00.000Z")
  assert.equal(computeQrisExpiresAt(10, null, now), "2026-08-19T03:10:00.000Z")
  // Provider lebih lama → dipatok setting (5 menit).
  assert.equal(computeQrisExpiresAt(5, "2026-08-19T03:59:00.000Z", now), "2026-08-19T03:05:00.000Z")
  // Provider lebih cepat → provider menang.
  assert.equal(computeQrisExpiresAt(5, "2026-08-19T03:02:00.000Z", now), "2026-08-19T03:02:00.000Z")
  // Provider rusak → fallback setting.
  assert.equal(computeQrisExpiresAt(5, "bukan-tanggal", now), "2026-08-19T03:05:00.000Z")
})

test("checkoutSettingsSchema: qris_expiry_minutes 1–60 integer", () => {
  assert.equal(checkoutSettingsSchema.safeParse({ qris_expiry_minutes: 3 }).success, true)
  assert.equal(checkoutSettingsSchema.safeParse({}).success, true)
  assert.equal(checkoutSettingsSchema.safeParse({ qris_expiry_minutes: 0 }).success, false)
  assert.equal(checkoutSettingsSchema.safeParse({ qris_expiry_minutes: 61 }).success, false)
  assert.equal(checkoutSettingsSchema.safeParse({ qris_expiry_minutes: 3.5 }).success, false)
})

test("checkoutSettingsSchema: offline_enabled boolean optional (docs/05 mode offline)", () => {
  assert.equal(checkoutSettingsSchema.safeParse({ offline_enabled: true }).success, true)
  assert.equal(checkoutSettingsSchema.safeParse({ offline_enabled: false }).success, true)
  assert.equal(checkoutSettingsSchema.safeParse({ offline_enabled: "true" }).success, false)
  assert.equal(transactionListQuerySchema.safeParse({ method: "offline" }).success, true)
})

test("buildCheckoutPayload: form QRIS tanpa toggle offline TIDAK mengirim offline_enabled", () => {
  const fd = new FormData()
  fd.set("qris_expiry_minutes", "7")
  const payload = buildCheckoutPayload(fd)
  assert.deepEqual(payload, { qris_expiry_minutes: 7 })
  assert.equal("offline_enabled" in payload, false)
})

test("buildCheckoutPayload: toggle offline hadir → ikut dikirim", () => {
  const fd = new FormData()
  fd.set("qris_expiry_minutes", "5")
  fd.set("offline_enabled", "on")
  assert.deepEqual(buildCheckoutPayload(fd), { qris_expiry_minutes: 5, offline_enabled: true })
})

test("mergeCheckout: update parsial QRIS mempertahankan offline_enabled (anti-clobber)", () => {
  const current = { offline_enabled: true, qris_expiry_minutes: 3 }
  const merged = mergeCheckout(current, { qris_expiry_minutes: 7 })
  assert.deepEqual(merged, { offline_enabled: true, qris_expiry_minutes: 7 })
})

test("mergeCheckout: patch eksplisit offline_enabled=false tetap menang", () => {
  const current = { offline_enabled: true, qris_expiry_minutes: 3 }
  const merged = mergeCheckout(current, { qris_expiry_minutes: 3, offline_enabled: false })
  assert.equal(merged.offline_enabled, false)
})
