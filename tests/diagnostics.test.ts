import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildCloudHeartbeat,
  buildLocalDiagnostics,
  buildManualDiagnosticsExport,
} from "../runtime/diagnostics.ts";
import { openDatabase, setMeta } from "../runtime/db/index.ts";
import { loadConfig } from "../runtime/config.ts";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "snapyos-diag-"));
  const db = openDatabase(dir);
  setMeta(db, "business_slug", "demo");
  setMeta(db, "photobox_slug", "booth");
  setMeta(db, "exit_pin_emergency_hash", "secret-pin-hash");
  const config = loadConfig({
    PHOTOBOOTH_BRIDGE_TOKEN: "bridge-token-0123456789",
    SNAPYOS_DATA_DIR: dir,
    SNAPYOS_DEVICE_TOKEN: "device-token-0123456789abcdef",
    SNAPYOS_CLOUD_URL: "https://cloud.test",
    SNAPYOS_CAMERA: "mock",
    SNAPYOS_PRINTER: "mock",
    SNAPYOS_ALLOW_MOCK: "1",
  });
  return { db, config };
}

test("diagnostics serializes safe local facts and manual export exclusions", () => {
  const { db, config } = fixture();
  const report = buildLocalDiagnostics({
    db,
    config,
    now: () => Date.parse("2026-11-06T00:00:00.000Z"),
    camera: { adapter: "mock", connected: true, mock: true },
    cameraStream: null,
    printer: { adapter: "mock", ok: true, printer: null, mock: true, output: "" },
    errors: [{ source: "queue", at: "now", message: "token=secret@example.com" }],
    disk: {
      total_bytes: 1000,
      free_bytes: 900,
      available_bytes: 900,
      used_bytes: 100,
      healthy: true,
    },
  });
  const exported = buildManualDiagnosticsExport(report);
  assert.equal(report.pairing.paired, true);
  assert.equal(report.lockdown.local_pin_configured, true);
  assert.match(exported, /snapyos\.local-diagnostics/);
  assert.match(exported, /photos/);
  assert.doesNotMatch(exported, /secret-pin-hash/);
  assert.doesNotMatch(exported, /device-token-0123456789abcdef/);
  assert.match(exported, /\*\*\*@example\.com/);
});

test("cloud heartbeat is an allowlisted summary", () => {
  const { db, config } = fixture();
  const report = buildLocalDiagnostics({
    db,
    config,
    camera: { adapter: "mock", connected: true, mock: true },
    cameraStream: null,
    printer: { adapter: "mock", ok: true, printer: null, mock: true, output: "" },
    disk: null,
  });
  const heartbeat = buildCloudHeartbeat(report);
  assert.deepEqual(Object.keys(heartbeat).sort(), [
    "camera",
    "db_version",
    "lockdown",
    "printer",
    "queue",
    "runtime_version",
  ]);
  assert.equal("device_token" in heartbeat, false);
  assert.equal("last_errors" in heartbeat, false);
  assert.equal("business_slug" in heartbeat, false);
});
