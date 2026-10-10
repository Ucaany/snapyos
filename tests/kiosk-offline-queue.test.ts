/**
 * C4 (security) — offline-queue migration must NOT wipe the live queue on boot.
 * Sebelum fix: purgeLegacyDeviceTokenStore() memanggil deleteDatabase(DB yang
 * SAMA dengan antrian live) tiap mount → reload menghapus finalize pending.
 * Sekarang flag-gated sekali-jalan.
 * Logic-only: mock indexedDB + localStorage global.
 * Run: npm test
 */

import assert from "node:assert/strict"
import { test } from "node:test"

type Store = Map<string, unknown>

function installMocks() {
  const flags = new Map<string, string>()
  const deletes: string[] = []
  const liveItems: Store = new Map()

  const fakeLocalStorage = {
    getItem: (k: string) => flags.get(k) ?? null,
    setItem: (k: string, v: string) => void flags.set(k, v),
    removeItem: (k: string) => void flags.delete(k),
  }

  const fakeIndexedDB = {
    deleteDatabase: (name: string) => {
      deletes.push(name)
      liveItems.clear()
      const req: { onsuccess?: () => void; onblocked?: () => void } = {}
      // Simulasikan delete SUKSES (tidak diblok) → flag boleh di-set oleh onsuccess.
      queueMicrotask(() => req.onsuccess?.())
      return req as unknown as IDBOpenDBRequest
    },
    open: () => {
      const req = {
        result: {
          objectStoreNames: { contains: () => true },
          transaction: () => ({
            objectStore: () => ({
              put: (v: { sessionId: string }) => {
                liveItems.set(v.sessionId, v)
                const r: { onsuccess?: () => void } = {}
                queueMicrotask(() => r.onsuccess?.())
                return r
              },
              getAll: () => {
                const r: { result?: unknown[]; onsuccess?: () => void } = {
                  result: [...liveItems.values()],
                }
                queueMicrotask(() => r.onsuccess?.())
                return r
              },
              delete: (k: string) => {
                liveItems.delete(k)
                const r: { onsuccess?: () => void } = {}
                queueMicrotask(() => r.onsuccess?.())
                return r
              },
            }),
            oncomplete: null as unknown,
          }),
          close: () => {},
        },
        onupgradeneeded: null as unknown,
        onsuccess: null as unknown,
        onerror: null as unknown,
      }
      queueMicrotask(() => (req as { onsuccess?: () => void }).onsuccess?.())
      return req
    },
  }

  ;(globalThis as Record<string, unknown>).localStorage = fakeLocalStorage
  ;(globalThis as Record<string, unknown>).indexedDB = fakeIndexedDB
  return { deletes, liveItems }
}

test("boot pertama: purge sekali; boot kedua (flag ada): tidak sentuh DB", async () => {
  const { deletes } = installMocks()
  const mod = await import("../src/components/kiosk/offline-queue.ts")

  mod.purgeLegacyDeviceTokenStore()
  assert.equal(deletes.length, 1, "boot pertama harus purge sekali")
  assert.equal(deletes[0], "snapyos-kiosk")

  // onsuccess (yang set flag) berjalan di microtask → beri kesempatan.
  await Promise.resolve()

  mod.purgeLegacyDeviceTokenStore()
  mod.purgeLegacyDeviceTokenStore()
  assert.equal(deletes.length, 1, "boot berikutnya TIDAK boleh deleteDatabase lagi")
})

test("delete diblok (onblocked): flag TIDAK di-set → retry boot berikutnya", async () => {
  const deletes: string[] = []
  const flags = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => flags.get(k) ?? null,
    setItem: (k: string, v: string) => void flags.set(k, v),
    removeItem: (k: string) => void flags.delete(k),
  }
  ;(globalThis as Record<string, unknown>).indexedDB = {
    deleteDatabase: (name: string) => {
      deletes.push(name)
      const req: { onsuccess?: () => void; onblocked?: () => void } = {}
      // TIDAK memanggil onsuccess — simulasikan blocked.
      return req as unknown as IDBOpenDBRequest
    },
  }
  const mod = await import("../src/components/kiosk/offline-queue.ts")
  mod.purgeLegacyDeviceTokenStore()
  await Promise.resolve()
  // Flag belum ter-set → boot berikutnya mencoba lagi.
  mod.purgeLegacyDeviceTokenStore()
  assert.equal(deletes.length, 2, "blocked → percobaan ulang pada boot berikutnya")
})

test("item ter-enqueue tetap ada setelah boot kedua (tidak dihapus purge)", async () => {
  const { deletes, liveItems } = installMocks()
  const mod = await import("../src/components/kiosk/offline-queue.ts")

  // boot pertama: purge (DB kosong) + flag.
  mod.purgeLegacyDeviceTokenStore()
  await Promise.resolve()
  // enqueue item (DB baru dibuat oleh open()).
  await mod.enqueueFinalize({
    sessionId: "sess-1",
    businessSlug: "demo",
    templateId: null,
    retakeCount: 0,
    photos: [],
    queuedAt: Date.now(),
  })
  assert.equal(liveItems.size, 1)
  const before = deletes.length

  // boot kedua.
  mod.purgeLegacyDeviceTokenStore()
  assert.equal(deletes.length, before, "boot kedua tidak purge")

  const items = await mod.listQueued()
  assert.equal(items.length, 1, "item antrian survive boot kedua")
  assert.equal(items[0]!.sessionId, "sess-1")
})

test("DB_VERSION naik ke 2 (migrasi via onupgradeneeded, bukan delete)", async () => {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/components/kiosk/offline-queue.ts", import.meta.url), "utf8")
  )
  assert.match(src, /const DB_VERSION = 2/)
  assert.match(src, /MIGRATED_FLAG/)
})
