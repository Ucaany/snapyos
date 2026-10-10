/**
 * Storage accounting — model PURE (tanpa DB/IO) untuk invarian akuntansi kuota
 * (Fase 5, migrasi 0062). Dipakai test + dokumentasi semantik RPC
 * `storage_account_add` / `storage_account_sub` di SQL. Implementasi runtime ada
 * di RPC Postgres (atomik); modul ini adalah cermin perilaku yang diuji.
 *
 * Invarian yang dijamin:
 *  - add idempotent per object_key (retry upload tak menggandakan).
 *  - sub idempotent (key yang tak ada = no-op; delete ganda aman).
 *  - used_bytes TIDAK pernah negatif (clamp ≥ 0).
 *  - add/sub mengembalikan used_bytes setelah operasi.
 */

export type LedgerEntry = { businessId: string; bucket: string; bytes: number }

export type StorageState = {
  /** object_key → entri ledger (sumber kebenaran delta). */
  ledger: Map<string, LedgerEntry>
  /** business_id → used_bytes (counter agregat, dibaca hot-path). */
  usage: Map<string, number>
}

export function createState(): StorageState {
  return { ledger: new Map(), usage: new Map() }
}

function counter(state: StorageState, businessId: string): number {
  return state.usage.get(businessId) ?? 0
}

/** Cermin storage_account_add: idempotent per key; counter naik hanya bila baru. */
export function accountAdd(
  state: StorageState,
  businessId: string,
  bucket: string,
  key: string,
  bytes: number
): number {
  const size = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0
  if (!state.usage.has(businessId)) state.usage.set(businessId, 0)
  if (state.ledger.has(key)) return counter(state, businessId)
  state.ledger.set(key, { businessId, bucket, bytes: size })
  state.usage.set(businessId, counter(state, businessId) + size)
  return counter(state, businessId)
}

/** Cermin storage_account_sub: idempotent; clamp ≥ 0; hanya business-scoped key. */
export function accountSub(state: StorageState, businessId: string, keys: string[]): number {
  if (!state.usage.has(businessId)) state.usage.set(businessId, 0)
  let freed = 0
  for (const key of new Set(keys)) {
    const entry = state.ledger.get(key)
    if (!entry || entry.businessId !== businessId) continue
    freed += entry.bytes
    state.ledger.delete(key)
  }
  if (freed > 0) {
    state.usage.set(businessId, Math.max(0, counter(state, businessId) - freed))
  }
  return counter(state, businessId)
}

/** Cermin pemakaian hot-path: satu nilai counter, O(1), tanpa listing. */
export function usedBytes(state: StorageState, businessId: string): number {
  return counter(state, businessId)
}
