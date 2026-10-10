import assert from "node:assert/strict"
import test from "node:test"

import {
  isDeviceOnline,
  countOnline,
  DEVICE_ONLINE_WINDOW_MS,
} from "../src/lib/device-online.ts"

const NOW = 1_800_000_000_000

test("isDeviceOnline: active + heartbeat dalam window = online", () => {
  assert.equal(isDeviceOnline("active", null, new Date(NOW - 10_000).toISOString(), NOW), true)
  assert.equal(isDeviceOnline("active", new Date(NOW - 10_000).toISOString(), null, NOW), true)
})

test("isDeviceOnline: status non-active = offline (walau heartbeat fresh)", () => {
  assert.equal(isDeviceOnline("revoked", null, new Date(NOW - 1_000).toISOString(), NOW), false)
})

test("isDeviceOnline: heartbeat lebih baru dari last_seen dipakai (kanonik)", () => {
  const staleSeen = new Date(NOW - 80_000).toISOString()
  const freshHeartbeat = new Date(NOW - 1_000).toISOString()
  assert.equal(isDeviceOnline("active", staleSeen, freshHeartbeat, NOW), true)
})

test("isDeviceOnline: di luar window = offline", () => {
  const old = new Date(NOW - DEVICE_ONLINE_WINDOW_MS - 1).toISOString()
  assert.equal(isDeviceOnline("active", old, null, NOW), false)
})

test("isDeviceOnline: tanpa heartbeat/seen = offline", () => {
  assert.equal(isDeviceOnline("active", null, null, NOW), false)
})

test("countOnline: 2 online + 1 offline + 1 revoked", () => {
  const rows = [
    { status: "active", last_seen_at: new Date(NOW - 5_000).toISOString(), last_heartbeat_at: null },
    { status: "active", last_seen_at: new Date(NOW - 5_000).toISOString(), last_heartbeat_at: null },
    { status: "active", last_seen_at: new Date(NOW - 200_000).toISOString(), last_heartbeat_at: null },
    { status: "revoked", last_seen_at: new Date(NOW - 1_000).toISOString(), last_heartbeat_at: null },
  ]
  assert.equal(countOnline(rows, NOW), 2)
})

test("countOnline: 2 device online vs limit 1 → dihitung 2 (gate tolak)", () => {
  const rows = [
    { status: "active", last_seen_at: new Date(NOW - 1_000).toISOString(), last_heartbeat_at: null },
    { status: "active", last_seen_at: new Date(NOW - 1_000).toISOString(), last_heartbeat_at: null },
  ]
  assert.equal(countOnline(rows, NOW), 2)
})

test("countOnline: 1 online + 1 offline vs limit 1 → 1 (gate lolos)", () => {
  const rows = [
    { status: "active", last_seen_at: new Date(NOW - 1_000).toISOString(), last_heartbeat_at: null },
    { status: "active", last_seen_at: new Date(NOW - 200_000).toISOString(), last_heartbeat_at: null },
  ]
  assert.equal(countOnline(rows, NOW), 1)
})
