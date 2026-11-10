/**
 * Rencana rekonsiliasi `storage_objects` vs listing bucket — PURE (tanpa
 * `server-only`) agar dapat diuji via node:test.
 *
 * `reconcileBusinessStorage` memakai rencana ini untuk MENGOREKSI drift
 * (bukan hanya seed awal): ledger yang memuat objek yang sudah tidak ada di
 * bucket, dan objek bucket yang tidak tercatat di ledger.
 *
 * Penting: rencana hanya berisi delta yang dapat dieksekusi RPC idempotent
 * (`storage_account_add` / `storage_account_sub`). Bila ledger == listing,
 * rencana kosong — cron aman dijalankan berkali-kali.
 */

export type ReconcileEntry = {
  key: string;
  bytes: number;
  bucket: string;
};

export type ReconcilePlan = {
  /** Ada di bucket, belum di ledger (atau bytes beda) — perlu di-add. */
  add: ReconcileEntry[];
  /** Ada di ledger, tidak ada di bucket — perlu di-sub. */
  remove: string[];
  /** Ada di keduanya tapi ukuran berbeda — sub lama lalu add baru. */
  resize: ReconcileEntry[];
};

const EMPTY: ReconcilePlan = { add: [], remove: [], resize: [] };

/**
 * Bandingkan ledger (per object_key unik) dengan listing aktual.
 * Byte yang tidak valid (`NaN`/negatif) dinormalkan 0 — sama seperti RPC.
 */
export function planStorageReconcile(
  ledger: ReconcileEntry[],
  listing: ReconcileEntry[]
): ReconcilePlan {
  const listed = new Map<string, ReconcileEntry>();
  for (const entry of listing) {
    if (!entry.key) continue;
    listed.set(entry.key, { ...entry, bytes: normalizeBytes(entry.bytes) });
  }
  const recorded = new Map<string, ReconcileEntry>();
  for (const entry of ledger) {
    if (!entry.key) continue;
    recorded.set(entry.key, { ...entry, bytes: normalizeBytes(entry.bytes) });
  }

  if (listed.size === 0 && recorded.size === 0) return { ...EMPTY };

  const plan: ReconcilePlan = { add: [], remove: [], resize: [] };
  for (const [key, entry] of listed) {
    const existing = recorded.get(key);
    if (!existing) plan.add.push(entry);
    else if (existing.bytes !== entry.bytes) plan.resize.push(entry);
  }
  for (const key of recorded.keys()) {
    if (!listed.has(key)) plan.remove.push(key);
  }
  return plan;
}

export function planIsEmpty(plan: ReconcilePlan): boolean {
  return plan.add.length === 0 && plan.remove.length === 0 && plan.resize.length === 0;
}

/** Total bytes aktual menurut listing (basis `used_bytes` yang benar). */
export function listingTotalBytes(listing: ReconcileEntry[]): number {
  let total = 0;
  for (const entry of listing) total += normalizeBytes(entry.bytes);
  return total;
}

function normalizeBytes(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
