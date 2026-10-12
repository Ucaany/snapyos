/**
 * Exit PIN kiosk unit checks — docs/05 §5.0 (PIN petugas keluar mode photobooth).
 * Cakupan: schema deviceExit (pin opsional 4–8 digit), exit_pin di
 * photoboxUpdate (hash di server, bukan kolom), argon2id hash + verify PIN.
 * Run: npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { hashDevicePin, verifyDevicePin } from "../src/lib/device-token.ts"
import {
  deviceExitSchema,
  photoboxCreateSchema,
  photoboxUpdateSchema,
} from "../src/lib/validators.ts"

// --- Schema keluar kiosk ---
test("deviceExitSchema: token wajib, pin opsional 4–8 digit", () => {
  const ok = deviceExitSchema.safeParse({ device_token: "t".repeat(64) })
  assert.equal(ok.success, true) // tanpa PIN — booth yang belum pasang PIN

  const withPin = deviceExitSchema.safeParse({ device_token: "t".repeat(64), pin: "123456" })
  assert.equal(withPin.success, true)

  assert.equal(deviceExitSchema.safeParse({ pin: "1234" }).success, false) // tanpa token
  assert.equal(
    deviceExitSchema.safeParse({ device_token: "t".repeat(64), pin: "12" }).success,
    false
  ) // terlalu pendek
  assert.equal(
    deviceExitSchema.safeParse({ device_token: "t".repeat(64), pin: "12a4" }).success,
    false
  ) // bukan digit
  assert.equal(
    deviceExitSchema.safeParse({ device_token: "t".repeat(64), pin: "123456789" }).success,
    false
  ) // terlalu panjang
})

// --- Schema owner: set PIN dari dashboard ---
test("photoboxUpdateSchema: exit_pin 4–8 digit, opsional", () => {
  assert.equal(photoboxUpdateSchema.safeParse({ exit_pin: "4321" }).success, true)
  assert.equal(photoboxUpdateSchema.safeParse({}).success, true) // kosong = tidak diubah
  assert.equal(photoboxUpdateSchema.safeParse({ exit_pin: "99" }).success, false)
  assert.equal(photoboxUpdateSchema.safeParse({ exit_pin: "abcd" }).success, false)
})

// --- Schema owner: set PIN saat CREATE (form create juga punya field PIN) ---
test("photoboxCreateSchema: exit_pin dipertahankan (tidak di-strip), 4–8 digit", () => {
  const base = {
    name: "Booth 01",
    slug: "booth-01",
    outlet_id: "22222222-2222-4222-8222-222222222222",
  }
  // Regresi: sebelumnya `exit_pin` tak ada di create schema → Zod strip → PIN
  // hilang tanpa error saat buat booth dari form create.
  const withPin = photoboxCreateSchema.safeParse({ ...base, exit_pin: "4321" })
  assert.equal(withPin.success, true)
  assert.equal(withPin.success && withPin.data.exit_pin, "4321")

  assert.equal(photoboxCreateSchema.safeParse(base).success, true) // tanpa PIN = ok
  assert.equal(photoboxCreateSchema.safeParse({ ...base, exit_pin: "12" }).success, false)
  assert.equal(photoboxCreateSchema.safeParse({ ...base, exit_pin: "abcd" }).success, false)
})

// --- Hash PIN (argon2id — encoded string per-call unik karena salt random) ---
test("hashDevicePin/verifyDevicePin: argon2id, salt random, verify benar-salah", async () => {
  const a = await hashDevicePin("4321")
  const b = await hashDevicePin("4321")
  assert.ok(a.startsWith("$argon2id$"), "hash harus argon2id encoded")
  assert.notEqual(a, b, "salt random → hash beda meski PIN sama")
  assert.equal(await verifyDevicePin("4321", a), true)
  assert.equal(await verifyDevicePin("4322", a), false)
})

test("verifyDevicePin: hash legacy sha256 → false (owner harus set ulang)", async () => {
  const sha256Hex = "a".repeat(64)
  assert.equal(await verifyDevicePin("4321", sha256Hex), false)
})
