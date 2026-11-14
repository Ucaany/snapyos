import test from "node:test";
import assert from "node:assert/strict";

import { isBoothOnline, summarizeBooths } from "./booth-health.ts";
import { heartbeatLabel } from "./heartbeat-label.ts";

const NOW = Date.parse("2026-11-14T18:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

void test("isBoothOnline: hanya heartbeat dalam 90 detik", () => {
  assert.equal(isBoothOnline(ago(30), NOW), true);
  assert.equal(isBoothOnline(ago(90), NOW), true);
  assert.equal(isBoothOnline(ago(91), NOW), false);
  assert.equal(isBoothOnline(null, NOW), false);
  assert.equal(isBoothOnline("bukan-tanggal", NOW), false);
});

void test("summarizeBooths: online, offline, maintenance tidak saling tumpang tindih", () => {
  const summary = summarizeBooths(
    [
      { status: "offline", lastHeartbeatAt: ago(20) },
      { status: "offline", lastHeartbeatAt: ago(600) },
      { status: "maintenance", lastHeartbeatAt: ago(10) },
      { status: "online", lastHeartbeatAt: null },
    ],
    NOW
  );
  assert.deepEqual(summary, { total: 4, online: 1, offline: 2, maintenance: 1 });
});

void test("heartbeatLabel: label relatif Bahasa Indonesia", () => {
  assert.equal(heartbeatLabel(null, NOW), "Belum pernah");
  assert.equal(heartbeatLabel(ago(5), NOW), "5 detik lalu");
  assert.equal(heartbeatLabel(ago(120), NOW), "2 menit lalu");
  assert.equal(heartbeatLabel(ago(7200), NOW), "2 jam lalu");
  assert.equal(heartbeatLabel(ago(172800), NOW), "2 hari lalu");
});
