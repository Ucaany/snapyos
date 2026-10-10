/**
 * Phase 5 — storage usage accounting (migrasi 0062).
 * Menguji invarian akuntansi counter pengganti recursive listing hot-path:
 * upload/gagal/delete/gagal-delete/retention/concurrent/limit.
 * Run: npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { accountAdd, accountSub, createState, usedBytes } from "../src/lib/storage-accounting.ts"

const BIZ = "biz-1"
const ASSETS = "business-assets"
const GEN = "generated-photos"

test("upload: add menaikkan counter tepat sebesar bytes", () => {
  const s = createState()
  accountAdd(s, BIZ, GEN, `${BIZ}/sessions/s1/photo-00.jpg`, 1000)
  accountAdd(s, BIZ, GEN, `${BIZ}/sessions/s1/photo-01.jpg`, 2000)
  assert.equal(usedBytes(s, BIZ), 3000)
})

test("failed upload: tak ada add → counter tetap", () => {
  const s = createState()
  accountAdd(s, BIZ, GEN, `${BIZ}/ok.jpg`, 500)
  // upload gagal = tidak memanggil accountAdd
  assert.equal(usedBytes(s, BIZ), 500)
})

test("delete: sub menurunkan counter sebesar bytes objek", () => {
  const s = createState()
  accountAdd(s, BIZ, GEN, `${BIZ}/a.jpg`, 800)
  accountAdd(s, BIZ, GEN, `${BIZ}/b.jpg`, 400)
  accountSub(s, BIZ, [`${BIZ}/a.jpg`])
  assert.equal(usedBytes(s, BIZ), 400)
})

test("failed delete: tak ada sub → counter tetap (media tak hilang)", () => {
  const s = createState()
  accountAdd(s, BIZ, GEN, `${BIZ}/a.jpg`, 800)
  // delete storage gagal = tidak memanggil accountSub
  assert.equal(usedBytes(s, BIZ), 800)
})

test("idempotent: add key sama (retry upload) tak menggandakan", () => {
  const s = createState()
  accountAdd(s, BIZ, GEN, `${BIZ}/retry.jpg`, 1234)
  accountAdd(s, BIZ, GEN, `${BIZ}/retry.jpg`, 1234)
  accountAdd(s, BIZ, GEN, `${BIZ}/retry.jpg`, 1234)
  assert.equal(usedBytes(s, BIZ), 1234)
})

test("idempotent: sub key yang sudah tak ada = no-op (delete ganda)", () => {
  const s = createState()
  accountAdd(s, BIZ, GEN, `${BIZ}/a.jpg`, 700)
  accountSub(s, BIZ, [`${BIZ}/a.jpg`])
  accountSub(s, BIZ, [`${BIZ}/a.jpg`])
  assert.equal(usedBytes(s, BIZ), 0)
})

test("race/negative: sub tanpa ledger tak membuat counter negatif", () => {
  const s = createState()
  accountAdd(s, BIZ, ASSETS, `${BIZ}/logo.png`, 300)
  // sub key yang tak pernah tercatat (mis. drift) → clamp ≥ 0
  accountSub(s, BIZ, [`${BIZ}/hantu.png`])
  assert.equal(usedBytes(s, BIZ), 300)
  // sub melebihi saldo tidak membuat negatif
  accountSub(s, BIZ, [`${BIZ}/logo.png`, `${BIZ}/logo.png`])
  assert.equal(usedBytes(s, BIZ), 0)
})

test("retention: hapus batch key sesi menurunkan counter sesuai total", () => {
  const s = createState()
  const keys = [`${BIZ}/sessions/s1/photo-00.jpg`, `${BIZ}/sessions/s1/result.gif`]
  accountAdd(s, BIZ, GEN, keys[0]!, 1500)
  accountAdd(s, BIZ, GEN, keys[1]!, 2500)
  accountSub(s, BIZ, keys)
  assert.equal(usedBytes(s, BIZ), 0)
})

test("retention idempotent: run ulang dengan key sama tetap 0", () => {
  const s = createState()
  const keys = [`${BIZ}/sessions/s1/photo-00.jpg`]
  accountAdd(s, BIZ, GEN, keys[0]!, 1500)
  accountSub(s, BIZ, keys)
  accountSub(s, BIZ, keys)
  assert.equal(usedBytes(s, BIZ), 0)
})

test("concurrent upload: key berbeda → total = jumlah semua (tak ada lost update)", () => {
  const s = createState()
  const N = 50
  for (let i = 0; i < N; i++) {
    // simulasi interleave antar-business
    accountAdd(s, BIZ, GEN, `${BIZ}/c-${i}.jpg`, 100)
    accountAdd(s, "biz-2", GEN, `biz-2/c-${i}.jpg`, 100)
  }
  assert.equal(usedBytes(s, BIZ), N * 100)
  assert.equal(usedBytes(s, "biz-2"), N * 100)
})

test("concurrent upload key SAMA → hanya 1 tercatat (idempotent)", () => {
  const s = createState()
  accountAdd(s, BIZ, GEN, `${BIZ}/same.jpg`, 100)
  accountAdd(s, BIZ, GEN, `${BIZ}/same.jpg`, 100)
  assert.equal(usedBytes(s, BIZ), 100)
})

test("isolasi bisnis: sub business lain tak menyentuh counter kita", () => {
  const s = createState()
  accountAdd(s, BIZ, GEN, `${BIZ}/a.jpg`, 500)
  accountAdd(s, "biz-2", GEN, "biz-2/a.jpg", 500)
  accountSub(s, "biz-2", [`${BIZ}/a.jpg`]) // key bukan milik biz-2
  assert.equal(usedBytes(s, BIZ), 500)
})

test("usage limit: dipakai + masuk > limit → STORAGE_FULL (keputusan kuantitatif)", () => {
  const s = createState()
  const limitBytes = 10 * 1024 * 1024
  accountAdd(s, BIZ, GEN, `${BIZ}/big.jpg`, limitBytes - 1000)
  const incoming = 2000 // sisa 1000 < 2000 → melebihi
  assert.equal(usedBytes(s, BIZ) + incoming > limitBytes, true)
  // incoming kecil → muat
  assert.equal(usedBytes(s, BIZ) + 500 > limitBytes, false)
})

test("compat retention: used bytes = agregat objek tersisa setelah cleanup", () => {
  const s = createState()
  accountAdd(s, BIZ, ASSETS, `${BIZ}/branding/logo-x.png`, 300)
  accountAdd(s, BIZ, GEN, `${BIZ}/sessions/old/photo-00.jpg`, 1000)
  accountAdd(s, BIZ, GEN, `${BIZ}/sessions/new/photo-00.jpg`, 1200)
  // retention hanya membersihkan sesi lama
  accountSub(s, BIZ, [`${BIZ}/sessions/old/photo-00.jpg`])
  assert.equal(usedBytes(s, BIZ), 1500)
})
