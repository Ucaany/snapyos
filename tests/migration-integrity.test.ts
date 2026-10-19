/**
 * Integritas berkas migrasi — urutan, penamaan, dan cakupan rollback.
 *
 * Tidak menjalankan Postgres (mesin ini tidak punya `psql`); yang dijaga adalah
 * properti yang bisa dibaca dari NAMA BERKAS, karena itulah yang dipakai
 * operator saat menjalankan `ls db/migrations | sort | xargs psql -f`.
 *
 * Bahaya yang dicegah:
 *  - rollback terurut SEBELUM forward untuk nomor yang sama (dulu terjadi pada
 *    0019/0025/0026/0027/0028/0041/0056/0064 karena dua konvensi nama) →
 *    menjalankan seluruh direktori secara berurutan akan MENGHAPUS lebih dulu.
 *  - nomor duplikat tanpa rollback yang jelas pasangannya.
 *  - rollback yatim (nomor yang tidak punya file forward).
 */

import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"
import { test } from "node:test"

const MIGRATIONS = new URL("../db/migrations/", import.meta.url)

/** `NNNN_nama.sql` (underscore) atau `NNNN-nama.sql` (dash, gaya lama). */
const NUMBERED = /^(\d{4})[-_](.+?)\.sql$/

type Parsed = {
  file: string
  num: number
  isRollback: boolean
  /** Nama forward yang dipasangkan, tanpa ekstensi. */
  stem: string
}

function parse(file: string): Parsed | null {
  const m = file.match(NUMBERED)
  if (!m) return null
  const num = Number(m[1])
  const rest = m[2]!
  const isRollback = /_rollback$/.test(rest)
  return {
    file,
    num,
    isRollback,
    stem: isRollback ? rest.replace(/_rollback$/, "") : rest,
  }
}

let files: string[]
let parsed: Parsed[]

test("load migration directory", async () => {
  files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql"))
  parsed = files.map(parse).filter((p): p is Parsed => p !== null)
  assert.ok(parsed.length >= 60, `expected many migrations, got ${parsed.length}`)
})

test("setiap file bernomor mengikuti konvensi NNNN_/NNNN- (4 digit)", () => {
  const stray = files.filter((f) => !NUMBERED.test(f) && !/^APPLY_/.test(f))
  assert.deepEqual(stray, [], `nama tak sesuai konvensi: ${stray.join(", ")}`)
})

test("tidak ada nomor duplikat dengan stem forward yang sama", () => {
  const seen = new Map<string, string[]>()
  for (const p of parsed) {
    const key = `${p.num}:${p.isRollback ? "rb" : "fw"}:${p.stem}`
    seen.set(key, [...(seen.get(key) ?? []), p.file])
  }
  const dupes = [...seen.entries()].filter(([, fs]) => fs.length > 1)
  assert.deepEqual(dupes, [], `duplikat: ${JSON.stringify(dupes)}`)
})

test("URUTAN `sort` tidak pernah menaruh rollback sebelum forward-nya", () => {
  // Inilah regresi nyata: dua konvensi nama membuat `0025_rollback.sql` terurut
  // sebelum `0025_subscription_billing_fixes.sql` ( '_' > 's'? tidak — '_' (0x5f)
  // > 's' (0x73)? justru '_' < 's', jadi rollback dulu). Uji per-nomor.
  const byNum = new Map<number, Parsed[]>()
  for (const p of parsed) byNum.set(p.num, [...(byNum.get(p.num) ?? []), p])

  const hazards: string[] = []
  for (const [num, group] of byNum) {
    const forward = group.find((p) => !p.isRollback)
    const rollback = group.find((p) => p.isRollback)
    if (!forward || !rollback) continue
    const sorted = [forward.file, rollback.file].sort()
    if (sorted[0] === rollback.file) {
      hazards.push(`${num}: ${sorted.join(" lalu ")}`)
    }
  }
  assert.deepEqual(hazards, [], `rollback terurut sebelum forward:\n  ${hazards.join("\n  ")}`)
})

test("konvensi nama tunggal: rollback = '<nama-forward>_rollback.sql'", () => {
  // Tidak boleh ada lagi `NNNN_rollback.sql` tanpa nama forward.
  const bare = parsed.filter((p) => p.isRollback && /^\d{4}_rollback$/.test(p.file.replace(/\.sql$/, "")))
  assert.deepEqual(bare.map((p) => p.file), [], "rollback tanpa nama forward masih ada")
})

test("setiap rollback punya file forward dengan nomor + stem yang sama", () => {
  const forwards = new Set(parsed.filter((p) => !p.isRollback).map((p) => `${p.num}:${p.stem}`))
  const orphans = parsed
    .filter((p) => p.isRollback && !forwards.has(`${p.num}:${p.stem}`))
    .map((p) => p.file)
  assert.deepEqual(orphans, [], `rollback yatim: ${orphans.join(", ")}`)
})

test("nomor 0001 sengaja tidak ada (baseline = schema.sql), dan 0071 ada", () => {
  const nums = new Set(parsed.map((p) => p.num))
  assert.ok(!nums.has(1), "0001 tidak dipakai; baseline adalah db/schema.sql")
  assert.ok(nums.has(71), "0071 (search_path hardening) harus ada")
})
