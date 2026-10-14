/**
 * CAPTCHA (Cloudflare Turnstile) — gate login & create booth (docs/08 §8.18).
 * Kiosk customer TIDAK memakai captcha (keputusan produk): checkout/payment
 * schema tanpa captcha_token. Menguji: fail-closed production tanpa secret,
 * dev bypass, schema kiosk bebas captcha.
 * Run: npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { verifyTurnstile, turnstileEnabled } from "../src/lib/turnstile.ts"
import {
  checkoutCreateSchema,
  checkoutApplyVoucherSchema,
  paymentCreateSchema,
} from "../src/lib/validators.ts"

const SECRET = "TURNSTILE_SECRET_KEY"
const HOSTNAMES = "TURNSTILE_ALLOWED_HOSTNAMES"
const NODE_ENV = "NODE_ENV"
const env = process.env as Record<string, string | undefined>
const saved = { secret: env[SECRET], hostnames: env[HOSTNAMES], nodeEnv: env[NODE_ENV] }

function restore() {
  if (saved.secret === undefined) delete env[SECRET]
  else env[SECRET] = saved.secret
  if (saved.hostnames === undefined) delete env[HOSTNAMES]
  else env[HOSTNAMES] = saved.hostnames
  if (saved.nodeEnv === undefined) delete env[NODE_ENV]
  else env[NODE_ENV] = saved.nodeEnv
}

test("verifyTurnstile: tanpa secret → lewat di dev, BLOK di production (fail-closed)", async () => {
  delete env[SECRET]
  env[NODE_ENV] = "development"
  assert.equal(turnstileEnabled(), false)
  assert.equal(await verifyTurnstile("apa pun"), true)
  assert.equal(await verifyTurnstile(""), true)

  env[NODE_ENV] = "production"
  assert.equal(await verifyTurnstile("token"), false)
  assert.equal(await verifyTurnstile(""), false)
  restore()
})

test("verifyTurnstile: secret ada + token kosong → gagal tanpa panggil Cloudflare", async () => {
  env[SECRET] = "dummy-secret"
  assert.equal(turnstileEnabled(), true)
  assert.equal(await verifyTurnstile(""), false)
  assert.equal(await verifyTurnstile(null), false)
  assert.equal(await verifyTurnstile(undefined), false)
  restore()
})

test("verifyTurnstile: action dan hostname wajib cocok", async () => {
  const originalFetch = globalThis.fetch
  env[SECRET] = "dummy-secret"
  env[HOSTNAMES] = "app.example.test"
  env[NODE_ENV] = "production"
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ success: true, action: "login", hostname: "app.example.test" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  try {
    assert.equal(
      await verifyTurnstile("token", { expectedAction: "login" }),
      true
    )
    assert.equal(
      await verifyTurnstile("token", { expectedAction: "create-photobox" }),
      false
    )
    env[HOSTNAMES] = "other.example.test"
    assert.equal(
      await verifyTurnstile("token", { expectedAction: "login" }),
      false
    )
  } finally {
    globalThis.fetch = originalFetch
    restore()
  }
})

test("schema kiosk: TANPA captcha_token (kiosk customer bebas captcha)", () => {
  const token = "a".repeat(64)
  const uuid = "00000000-0000-4000-8000-000000000000"
  assert.equal(
    checkoutCreateSchema.safeParse({ package_id: uuid, device_token: token }).success,
    true
  )
  // captcha_token kini field tak dikenal → di-strip zod (bukan bagian kontrak kiosk).
  const stripped = checkoutCreateSchema.parse({ package_id: uuid, device_token: token, captcha_token: "tok" })
  assert.equal("captcha_token" in stripped, false)
  assert.equal(
    checkoutApplyVoucherSchema.safeParse({
      checkout_session_id: uuid,
      voucher_code: "HEMAT10",
      device_token: token,
    }).success,
    true
  )
  assert.equal(
    paymentCreateSchema.safeParse({
      checkout_session_id: uuid,
      device_token: token,
      method_id: "pakasir:qris",
    }).success,
    true
  )
})
