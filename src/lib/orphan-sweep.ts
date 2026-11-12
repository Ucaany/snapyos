/**
 * Pemilihan objek yatim `generated-photos` — PURE (tanpa `server-only`) agar
 * dapat diuji via node:test. Dipakai cron `/api/cron/orphan-sweep`.
 *
 * Objek yatim = objek yang TIDAK direferensikan `sessions.result_gif_key`,
 * `sessions.result_photos_gif_key`, maupun `photos.file_key`, dan umurnya melewati ambang minimum (default 24
 * jam) sehingga upload yang sedang berjalan tidak ikut tersapu.
 *
 * Modul ini hanya memilih; penghapusan + akuntansi dilakukan route.
 */

export type SweepObject = {
  /** Object key di bucket area (tanpa prefix area). */
  key: string;
  bytes: number;
  /** Waktu modifikasi objek (epoch ms) — sumber: `LastModified` listing R2. */
  lastModifiedMs: number;
};

export type SweepSelection<T extends SweepObject = SweepObject> = {
  /** Kandidat hapus, terlama dulu, maksimal `limit`. */
  orphans: T[];
  /** Dilewati karena masih direferensikan DB. */
  skippedReferenced: number;
  /** Dilewati karena belum melewati ambang umur. */
  skippedYoung: number;
};

/**
 * Pilih objek yatim dari SATU halaman listing.
 * `nowMs`/`minAgeMs` eksplisit supaya keputusan dapat diuji deterministik.
 * `lastModifiedMs` tidak valid (NaN) diperlakukan sebagai "belum tua" — objek
 * dengan metadata rusak tidak boleh terhapus karena tebakan.
 */
export function selectOrphans<T extends SweepObject>(
  objects: T[],
  referenced: ReadonlySet<string>,
  nowMs: number,
  minAgeMs: number,
  limit: number
): SweepSelection<T> {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  const cutoff = nowMs - minAgeMs;
  const candidates: T[] = [];
  let skippedReferenced = 0;
  let skippedYoung = 0;

  for (const obj of objects) {
    if (!obj.key) continue;
    if (referenced.has(obj.key)) {
      skippedReferenced++;
      continue;
    }
    if (!Number.isFinite(obj.lastModifiedMs) || obj.lastModifiedMs > cutoff) {
      skippedYoung++;
      continue;
    }
    candidates.push(obj);
  }

  candidates.sort((a, b) => a.lastModifiedMs - b.lastModifiedMs);
  return {
    orphans: max === 0 ? [] : candidates.slice(0, max),
    skippedReferenced,
    skippedYoung,
  };
}

/** Business id = segmen pertama key (`<businessId>/sessions/...`). */
export function businessIdFromKey(key: string): string | null {
  const segment = key.split("/")[0] ?? "";
  return segment.length > 0 ? segment : null;
}

/** Kelompokkan object key per business — akuntansi (`account_sub`) per tenant. */
export function groupKeysByBusiness(keys: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const key of keys) {
    const businessId = businessIdFromKey(key);
    if (!businessId) continue;
    const list = out.get(businessId) ?? [];
    list.push(key);
    out.set(businessId, list);
  }
  return out;
}
