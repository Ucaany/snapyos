/**
 * Retention hasil foto — docs/09 (storage), docs/12 Phase 11 (retention job).
 * Default 3 hari per business (business_settings.retention_days) —
 * keputusan produk #4 (migrasi 0034). Validator app membatasi 1..3.
 *
 * PURE (tanpa `server-only`) agar logika cleanup dapat diuji via node:test —
 * lihat `tests/retention.test.ts`. Pembungkus produksi (Supabase + storage
 * provider) ada di `src/app/api/cron/retention/route.ts`.
 */

export const DEFAULT_RETENTION_DAYS = 3;

/**
 * Rentang privasi retention: SATU sumber untuk jalur tenant
 * (`businessSettingsUpdateSchema.retention_days`) dan jalur admin
 * (`adminSettingsUpdateSchema.default_retention_days`, diterapkan ke SEMUA
 * tenant). Menaruhnya di sini mencegah kedua jalur itu melonggar sendiri-sendiri.
 */
export const RETENTION_MIN_DAYS = 1;
export const RETENTION_MAX_DAYS = 3;

/** Batas ISO: semua hasil dengan finalized_at < cutoff wajib dibersihkan. */
export function retentionCutoff(retentionDays: number, nowMs: number): string {
  const days =
    Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : DEFAULT_RETENTION_DAYS;
  if (!Number.isFinite(nowMs)) {
    throw new Error("retentionCutoff: nowMs tidak valid");
  }
  return new Date(nowMs - days * 86_400_000).toISOString();
}

export type RetentionLogger = (message: string, detail?: unknown) => void;

/** Satu sesi kandidat + media key-nya (hasil query batch sebelum cleanup). */
export type SessionMedia = {
  id: string;
  /** file_key + thumbnail_key tiap photo + result_gif_key (sudah dedup). */
  keys: string[];
};

export type RetentionStorage = {
  /**
   * Hapus key lintas-provider; kembalikan key yang gagal (retry nanti).
   * Prod = `removeResolvedOutcome("generated-photos", keys)`.
   */
  remove(keys: string[]): Promise<{ ok: string[]; failures: { key: string; message: string }[] }>;
};

export type RetentionDeps = {
  storage: RetentionStorage;
  /**
   * Catat pengurangan akuntansi untuk key yang BERHASIL dihapus (idempotent).
   * `ok:false` = RPC counter gagal → sesi terkait DITAHAN (baris photos +
   * media_cleaned_at tetap) agar run berikutnya mengulang akuntansi.
   * `missing:true` = fungsi/tabel akuntansi ABSEN (misconfig migration belum
   * diterapkan) → JANGAN tahan; perlakukan akuntansi tak tersedia (fail-open)
   * agar media tetap dibersihkan dan backlog tidak menumpuk selamanya.
   */
  accountSub(keys: string[]): Promise<{ ok: boolean; error?: string; missing?: boolean }>;
  /** Hapus baris photos + set media_cleaned_at/result_gif_key null untuk sesi sukses. */
  finalize(sessionIds: string[], cleanedAt: string): Promise<void>;
  log?: RetentionLogger;
};

export type RetentionResult = {
  cleanedSessions: number;
  removedObjects: number;
  /** Sesi yang ditahan karena ada object gagal (retry run berikutnya). */
  deferredSessions: number;
  /** Sesi yang ditahan karena akuntansi storage (accountSub) gagal. */
  deferredAccounting: number;
};

/**
 * Bersihkan media untuk satu batch sesi (provider-aware).
 *
 * Jaminan (aturan retention fase 6):
 * - `media_cleaned_at` HANYA di-set bila SEMUA object sesi berhasil dibersihkan
 *   atau sudah absen. Ada satu failure → sesi ditahan, di-retry run berikutnya.
 * - Missing object = idempotent (masuk `ok`).
 * - Satu object failure TIDAK membatalkan batch; object lain tetap diproses.
 * - Baris DB TIDAK dihapus sebelum storage bersih; histori session/transaction
 *   tidak pernah disentuh — hanya media.
 * - Log failure aman: hanya key + pesan provider (tanpa signed URL/kredensial).
 */
export async function cleanupSessionMedia(
  sessions: SessionMedia[],
  cleanedAt: string,
  deps: RetentionDeps
): Promise<RetentionResult> {
  const log = deps.log ?? (() => {});
  if (sessions.length === 0) {
    return { cleanedSessions: 0, removedObjects: 0, deferredSessions: 0, deferredAccounting: 0 };
  }

  const allKeys = Array.from(new Set(sessions.flatMap((s) => s.keys)));
  const failedKeys = new Set<string>();
  const okKeys = new Set<string>();

  if (allKeys.length > 0) {
    const { ok, failures } = await deps.storage.remove(allKeys);
    for (const key of ok) okKeys.add(key);
    for (const f of failures) {
      failedKeys.add(f.key);
      log(`storage.remove gagal key=${f.key}: ${f.message}`);
    }
  }

  const cleanSessionIds: string[] = [];
  let deferred = 0;
  for (const s of sessions) {
    // Sesi sukses bila tiap key-nya ok DAN bukan bagian dari failure.
    const blocked = s.keys.some((k) => failedKeys.has(k) && !okKeys.has(k));
    if (blocked) {
      deferred++;
      continue;
    }
    cleanSessionIds.push(s.id);
  }

  const removedKeys = Array.from(okKeys);
  let accountingOk = true;
  if (removedKeys.length > 0) {
    // Objek storage SUDAH terhapus di sini. Bila akuntansi gagal dan kita
    // finalize (hapus baris photos + set media_cleaned_at), key hilang dari
    // DB dan ledger tak pernah berkurang → counter under-count permanen.
    // Jadi bila accountSub gagal: TAHAN finalize. Baris photos.file_key tetap
    // ada → run berikutnya memasukkan key yang sama ke `okKeys` (objek absen
    // tetap dianggap ok oleh removeResolvedOutcome), lalu account_sub diulang.
    // `storage_account_sub` idempotent + counter di-clamp ≥ 0 → retry aman.
    const outcome = await deps.accountSub(removedKeys);
    if (!outcome.ok) {
      if (outcome.missing) {
        // MISCONFIG: RPC/tabel akuntansi belum ada (mis. migration 0062 belum
        // diterapkan). Menahan di sini akan men-defer SEMUA sesi selamanya →
        // backlog media/DB tumbuh tanpa batas. Fail-open: lanjut finalize
        // (media tetap bersih); surfacing misconfig lewat satu log.
        log(
          `accountSub tidak tersedia (misconfig: fungsi/tabel akuntansi absen): fail-open, finalize dilanjutkan: ${outcome.error ?? "unknown"}`
        );
      } else {
        // TRANSIENT (network/5xx): tahan finalize agar counter konsisten saat retry.
        accountingOk = false;
        log(`accountSub gagal: ${outcome.error ?? "unknown"}`);
      }
    }
  }

  if (!accountingOk) {
    // Semua sesi yang seharusnya dibersihkan ditahan agar media_cleaned_at
    // tetap null dan baris photos dipertahankan untuk run berikutnya.
    return {
      cleanedSessions: 0,
      removedObjects: removedKeys.length,
      deferredSessions: deferred + cleanSessionIds.length,
      deferredAccounting: cleanSessionIds.length,
    };
  }

  if (cleanSessionIds.length > 0) {
    await deps.finalize(cleanSessionIds, cleanedAt);
  }

  return {
    cleanedSessions: cleanSessionIds.length,
    removedObjects: removedKeys.length,
    deferredSessions: deferred,
    deferredAccounting: 0,
  };
}
