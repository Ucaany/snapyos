import assert from "node:assert/strict"
import test from "node:test"

import { deviceReportSchema } from "../src/lib/validators.ts"

const TOKEN = "a".repeat(64)

test("deviceReportSchema: payload kamera dari SetupWizard valid", () => {
  const parsed = deviceReportSchema.parse({
    device_token: TOKEN,
    preferred_device_id: "cam-1",
    camera: { resolution: "1920×1080", width: 1920 },
  })
  assert.equal(parsed.preferred_device_id, "cam-1")
  assert.equal(parsed.camera?.width, 1920)
})

test("deviceReportSchema: payload error kamera (diagnostik) valid", () => {
  const parsed = deviceReportSchema.parse({
    device_token: TOKEN,
    camera: { error: "NotAllowedError" },
  })
  assert.equal(parsed.camera?.error, "NotAllowedError")
})

test("deviceReportSchema: payload printer confirmed + last_test_at valid", () => {
  const parsed = deviceReportSchema.parse({
    device_token: TOKEN,
    printer: { confirmed: false, last_test_at: new Date().toISOString() },
  })
  assert.equal(parsed.printer?.confirmed, false)
})

test("deviceReportSchema: token pendek ditolak", () => {
  assert.throws(() => deviceReportSchema.parse({ device_token: "pendek" }))
})
