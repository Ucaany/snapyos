import assert from "node:assert/strict"
import test from "node:test"

import { resolveFacingMode } from "../src/lib/camera-provider.ts"
import {
  printCopies,
  printPageSize,
  printPlan,
  shouldAutoPrint,
} from "../src/lib/print-layout.ts"

test("resolveFacingMode: setting owner valid menang, invalid → fallback device", () => {
  assert.equal(resolveFacingMode("user", "environment"), "user")
  assert.equal(resolveFacingMode("environment", "user"), "environment")
  assert.equal(resolveFacingMode(null, "environment"), "environment")
  assert.equal(resolveFacingMode(undefined, "user"), "user")
  assert.equal(resolveFacingMode("depan", "environment"), "environment")
})

test("printPageSize: 4x6 portrait default; A6 + landscape swap", () => {
  assert.deepEqual(printPageSize(null), { widthMm: 101.6, heightMm: 152.4, marginMm: 0 })
  assert.deepEqual(printPageSize({ paper_size: "A6", orientation: "portrait", margins_mm: 5 }), {
    widthMm: 105,
    heightMm: 148,
    marginMm: 5,
  })
  const land = printPageSize({ paper_size: "4x6", orientation: "landscape", margins_mm: 0 })
  assert.equal(land.widthMm > land.heightMm, true)
  // margin clamp 0–20
  assert.equal(printPageSize({ margins_mm: 99 }).marginMm, 20)
  assert.equal(printPageSize({ margins_mm: -3 }).marginMm, 0)
})

test("printCopies: 1–20, invalid → 1", () => {
  assert.equal(printCopies(null), 1)
  assert.equal(printCopies({ copies: 3 }), 3)
  assert.equal(printCopies({ copies: 0 }), 1)
  assert.equal(printCopies({ copies: 99 }), 20)
  assert.equal(printCopies({ copies: 1.5 }), 1)
})

test("shouldAutoPrint: default true, eksplisit false → manual", () => {
  assert.equal(shouldAutoPrint(null), true)
  assert.equal(shouldAutoPrint({}), true)
  assert.equal(shouldAutoPrint({ auto_print: true }), true)
  assert.equal(shouldAutoPrint({ auto_print: false }), false)
})

test("printPlan existing tidak regresi (copies tidak ubah mapping lembar)", () => {
  assert.deepEqual(printPlan(2, 2, "single"), {
    kind: "single",
    sheets: 2,
    photoIndexes: [0, 1],
  })
})
