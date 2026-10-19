/**
 * Strategi cache service worker untuk aset statis.
 *
 * Kenapa ini diuji: aset di `public/` punya URL STABIL (tidak content-hashed,
 * berbeda dengan keluaran build Next). Dengan strategi cache-first, mengganti
 * isi sebuah aset tidak pernah terlihat di klien yang sudah terpasang — kiosk
 * PWA menyimpan salinan lama selamanya dan tidak pernah merevalidasi. Bug ini
 * nyata terjadi saat aset brand diganti (2026-10-16): berkas di server sudah
 * baru, tetapi halaman tetap memakai gambar lama sampai cache dibersihkan
 * manual. Tes ini menjaga tiga properti:
 *
 *   1. SW menyajikan salinan cache LEBIH DULU dan selalu memanggil `fetch`
 *      (stale-while-revalidate). Cache-first murni tanpa `fetch` = aset beku.
 *   2. Nama cache memuat versi (`vN`) agar `activate` bisa membuang cache lama.
 *   3. HTML navigasi dan `/api/` tidak pernah masuk cache.
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const SW = new URL("../public/sw.js", import.meta.url)

async function source(): Promise<string> {
  return readFile(SW, "utf8")
}

test("sw: nama cache memuat versi untuk invalidasi saat activate", async () => {
  const css = await source()
  const m = css.match(/const CACHE = "([^"]+)"/)
  assert.ok(m, "konstanta CACHE tidak ditemukan")
  assert.match(m![1]!, /-v\d+$/, "nama cache harus berakhiran -vN")
})

test("sw: aset statis memakai stale-while-revalidate, bukan cache-first beku", async () => {
  const css = await source()
  // Jalur fetch harus ada di handler aset statis.
  assert.match(
    css,
    /event\.respondWith\(/,
    "tidak ada event.respondWith di handler fetch"
  )
  // Ada panggilan fetch() di dalam jalur cache aset (pemasok pembaruan).
  const fetchHandler = css.slice(css.indexOf("addEventListener(\"fetch\""))
  assert.match(
    fetchHandler,
    /\bfetch\(request\)/,
    "aset statis tidak pernah direvalidasi ke jaringan (cache-first beku)"
  )
  // Salinan cache disajikan lebih dulu, jadi muat berikutnya memakai versi baru.
  assert.match(
    fetchHandler,
    /return hit \?\?/,
    "aset statis harus menyajikan cache lebih dulu lalu memperbarui di latar"
  )
})

test("sw: HTML navigasi tidak pernah di-cache", async () => {
  const css = await source()
  assert.match(css, /request\.mode === "navigate"\) return;/)
})

test("sw: permintaan /api/ tidak pernah di-cache", async () => {
  const css = await source()
  assert.match(css, /pathname\.startsWith\("\/api\/"\)\) return;/)
})

test("sw: hostname supabase tidak pernah di-cache", async () => {
  const css = await source()
  const fetchHandler = css.slice(css.indexOf("addEventListener(\"fetch\""))
  assert.match(fetchHandler, /hostname\.includes\("supabase"\)\) return;/)
})

test("sw: URL bertanda tangan (foto R2) tidak di-cache", async () => {
  const css = await source()
  assert.match(css, /X-Amz-Signature/)
})