/**
 * Phase 4–9 unit checks — owner platform (docs/04 §4.2–4.13, docs/12).
 * Cakupan: finance math (profit/margin/growth), CSV export, nomor transaksi,
 * RBAC matrix baru, validasi voucher manual-side, report filename.
 * Run: npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  formatBp,
  formatTxNumber,
  growthBp,
  marginBp,
  profitInteger,
} from "../src/lib/dashboard-math.ts"
import { csvCell, reportFilename, toCSV } from "../src/lib/report-csv.ts"
import { can } from "../src/lib/rbac.ts"
import { reportQuerySchema, voucherCreateSchema } from "../src/lib/validators.ts"

// --- Finance math (docs/04 §4.4) ---
test("profitInteger: net − expenses", () => {
  assert.equal(profitInteger(9_250_000, 2_100_000), 7_150_000)
  assert.equal(profitInteger(0, 500_000), -500_000)
})

test("marginBp: basis point integer, guard net ≤ 0", () => {
  assert.equal(marginBp(7_150_000, 9_250_000), 7_730) // 77.297...% → 7730 bp
  assert.equal(marginBp(0, 100), 0)
  assert.equal(marginBp(50, 0), 0)
  assert.ok(Number.isInteger(marginBp(1, 3)))
})

test("formatBp menampilkan persen id-ID", () => {
  assert.equal(formatBp(7_730), "77,3%")
  assert.equal(formatBp(10_000), "100%")
})

test("growthBp: naik/turun/divide-by-zero", () => {
  assert.equal(growthBp(200_000, 100_000), 10_000)
  assert.equal(growthBp(50_000, 100_000), -5_000)
  assert.equal(growthBp(0, 0), 0)
  assert.equal(growthBp(100, 0), 10_000)
})

// --- CSV export (docs/04 §4.16) ---
test("csvCell: escape separator, quote, newline", () => {
  assert.equal(csvCell("plain"), "plain")
  assert.equal(csvCell("a;b"), '"a;b"')
  assert.equal(csvCell('dia "Budi"'), '"dia ""Budi"""')
  assert.equal(csvCell("baris\nbaru"), '"baris\nbaru"')
  assert.equal(csvCell(null), "")
  assert.equal(csvCell(12_500), "12500")
})

test("csvCell: formula-injection guard blocks tab and carriage-return", () => {
  assert.equal(csvCell("\tcmd"), "'\tcmd")
  assert.equal(csvCell("\rcmd"), '"\'\rcmd"')
  assert.equal(csvCell("=1+1"), "'=1+1")
  assert.equal(csvCell("+1+1"), "'+1+1")
  assert.equal(csvCell("-1+1"), "'-1+1")
  assert.equal(csvCell("@SUM"), "'@SUM")
})

test("toCSV: BOM + CRLF + header", () => {
  const csv = toCSV(["A", "B"], [[1, "x;y"]])
  assert.ok(csv.startsWith("\uFEFF"))
  assert.ok(csv.includes("A;B\r\n"))
  assert.ok(csv.includes('1;"x;y"\r\n'))
})

test("reportFilename", () => {
  assert.equal(
    reportFilename("transactions", "2026-08-01", "2026-08-31", "csv"),
    "snapyos-transactions-2026-08-01-2026-08-31.csv"
  )
})

// --- Nomor transaksi manual (docs/04 §4.5) ---
test("formatTxNumber", () => {
  assert.equal(formatTxNumber("2026-08-18", "a1b2c3"), "TX-20260818-A1B2C3")
})

// --- RBAC matrix (docs/04 §4.13, docs/09; keputusan #6: expense:write owner-only) ---
test("RBAC: manager dapat modul operasional+finance, bukan staff-mgmt khusus", () => {
  assert.ok(can("manager", "package:write"))
  assert.ok(can("manager", "template:write"))
  assert.ok(can("manager", "voucher:write"))
  assert.ok(can("manager", "transaction:write"))
  assert.ok(can("manager", "customer:read"))
  assert.ok(can("manager", "finance:read"))
  // Keputusan #6: manager tanpa write sensitif.
  assert.ok(!can("manager", "expense:write"))
  assert.ok(can("manager", "expense:read"))
  assert.ok(can("manager", "subscription:read"))
  assert.ok(!can("manager", "subscription:write"))
  assert.ok(!can("manager", "transaction:manual-create"))
})

test("RBAC: staff tidak melihat finansial", () => {
  assert.ok(!can("staff", "transaction:read"))
  assert.ok(!can("staff", "finance:read"))
  assert.ok(!can("staff", "expense:write"))
  assert.ok(can("staff", "package:read"))
})

test("RBAC: owner wildcard", () => {
  assert.ok(can("owner", "anything:at:all"))
})

// --- Voucher validasi (docs/04 §4.11) ---
test("voucherCreateSchema: persen ≤ 100, code uppercase", () => {
  assert.ok(
    voucherCreateSchema.safeParse({ code: "GRANDOPENING", type: "percentage", amount: 20 }).success
  )
  assert.equal(
    voucherCreateSchema.safeParse({ code: "MURAH", type: "percentage", amount: 150 }).success,
    false
  )
  // code dinormalisasi uppercase oleh schema
  const parsed = voucherCreateSchema.parse({ code: "diskon50", type: "fixed", amount: 5_000 })
  assert.equal(parsed.code, "DISKON50")
})

// --- Report query schema (docs/04 §4.16) ---
test("reportQuerySchema: format pdf ditolak di level tipe enum", () => {
  assert.ok(
    reportQuerySchema.safeParse({
      type: "revenue",
      from: "2026-08-01",
      to: "2026-08-31",
      format: "csv",
    }).success
  )
  assert.equal(
    reportQuerySchema.safeParse({
      type: "revenue",
      from: "2026-08-01",
      to: "2026-08-31",
      format: "pdf",
    }).success,
    false
  )
  assert.equal(
    reportQuerySchema.safeParse({
      type: "unknown",
      from: "2026-08-01",
      to: "2026-08-31",
      format: "csv",
    }).success,
    false
  )
})
