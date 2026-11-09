import assert from "node:assert/strict";
import test from "node:test";

import { deviceHeartbeatSchema, deviceReportSchema } from "../src/lib/validators.ts";

const TOKEN = "a".repeat(64);

test("deviceReportSchema: payload kamera dari SetupWizard valid", () => {
  const parsed = deviceReportSchema.parse({
    device_token: TOKEN,
    preferred_device_id: "cam-1",
    camera: { resolution: "1920×1080", width: 1920 },
  });
  assert.equal(parsed.preferred_device_id, "cam-1");
  assert.equal(parsed.camera?.width, 1920);
});

test("deviceReportSchema: payload error kamera (diagnostik) valid", () => {
  const parsed = deviceReportSchema.parse({
    device_token: TOKEN,
    camera: { error: "NotAllowedError" },
  });
  assert.equal(parsed.camera?.error, "NotAllowedError");
});

test("deviceReportSchema: payload printer confirmed + last_test_at valid", () => {
  const parsed = deviceReportSchema.parse({
    device_token: TOKEN,
    printer: { confirmed: false, last_test_at: new Date().toISOString() },
  });
  assert.equal(parsed.printer?.confirmed, false);
});

test("deviceReportSchema: token pendek ditolak", () => {
  assert.throws(() => deviceReportSchema.parse({ device_token: "pendek" }));
});

test("deviceHeartbeatSchema: hanya metadata operasional", () => {
  const parsed = deviceHeartbeatSchema.parse({
    device_token: TOKEN,
    runtime_version: "0.1.0",
    db_version: 2,
    camera: { adapter: "mock", connected: true },
    printer: { adapter: "mock", ok: true },
    queue: { pending: 1, retrying: 0 },
    lockdown: { local_pin_configured: true, local_pin_locked: false, cloud_kiosk_locked: null },
  });
  assert.equal(parsed.queue.pending, 1);
  assert.throws(() => deviceHeartbeatSchema.parse({ ...parsed, photos: ["photo.jpg"] }));
  assert.throws(() => deviceHeartbeatSchema.parse({ ...parsed, payment_secret: "secret" }));
});
