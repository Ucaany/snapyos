import { test } from "node:test"
import assert from "node:assert/strict"

import { buildStaffDirectory } from "../src/lib/staff-directory.ts"

const members = [
  { userId: "u1", name: "Andi", email: "andi@klikfoto.id", role: "staff", joinedAt: "2026-01-01T00:00:00Z" },
  { userId: "u2", name: "Bella", email: "bella@klikfoto.id", role: "manager", joinedAt: "2026-01-02T00:00:00Z" },
]
const photoboxes = [
  { id: "b1", name: "BOOTH-A", status: "online" },
  { id: "b2", name: "BOOTH-B", status: "offline" },
]

test("agregasi transaksi hari ini per staff dari booth ter-assign", () => {
  // todayTx sekarang berbentuk agregat per booth (RPC staff_directory_today, 0037):
  // b1: 3 tx senilai 75_000 (50k + 25k), b2: 1 tx senilai 10_000.
  const { rows, totals } = buildStaffDirectory({
    members,
    assignments: [
      { user_id: "u1", photobox_id: "b1" },
      { user_id: "u1", photobox_id: "b2" },
      { user_id: "u2", photobox_id: "b1" },
    ],
    photoboxes,
    todayTx: [
      { photobox_id: "b1", revenue: 75_000, tx_count: 2 },
      { photobox_id: "b2", revenue: 10_000, tx_count: 1 },
    ],
  })
  const andi = rows.find((r) => r.userId === "u1")
  assert.equal(andi?.booths.length, 2)
  assert.equal(andi?.todayCount, 3)
  assert.equal(andi?.todayRevenue, 85_000)
  const bella = rows.find((r) => r.userId === "u2")
  assert.equal(bella?.todayCount, 2)
  assert.equal(bella?.todayRevenue, 75_000)
  assert.deepEqual(totals, { count: 3, revenue: 85_000 })
})

test("assignment ke photobox asing diabaikan; tanpa assignment = nol", () => {
  const { rows, totals } = buildStaffDirectory({
    members,
    assignments: [
      { user_id: "u1", photobox_id: "b1" },
      { user_id: "u1", photobox_id: "ghost" },
    ],
    photoboxes,
    todayTx: [{ photobox_id: "b1", revenue: 1_000, tx_count: 1 }],
  })
  const andi = rows.find((r) => r.userId === "u1")
  assert.deepEqual(andi?.booths.map((b) => b.id), ["b1"])
  assert.equal(andi?.todayCount, 1)
  const bella = rows.find((r) => r.userId === "u2")
  assert.equal(bella?.todayCount, 0)
  assert.equal(bella?.todayRevenue, 0)
  assert.deepEqual(totals, { count: 1, revenue: 1_000 })
})
