/**
 * Pemilihan nama provider storage (PURE, tanpa `server-only`) — Fase 3.
 * Dipisah dari `src/server/storage/index.ts` agar dapat diuji via node:test
 * (modul server menyentuh kredensial + import tanpa ekstensi).
 */

export type StorageProviderName = "supabase" | "r2";

/**
 * Provider UPLOAD BARU. Presedensi:
 *   1. `STORAGE_WRITE_PROVIDER` (eksplisit) — dipakai apa adanya.
 *   2. `STORAGE_PROVIDER` legacy `r2` — dihormati.
 *   3. R2 default HANYA bila konfigurasi R2 lengkap (env ada). Bila env R2
 *      belum diisi, turun ke Supabase → deploy tanpa R2 env TIDAK 500
 *      (getR2Client() akan throw bila dipaksa, mematikan SEMUA read path).
 * Nilai `STORAGE_PROVIDER=supabase` tidak pernah menahan media baru di Supabase.
 */
export function r2Configured(env: Record<string, string | undefined>): boolean {
  const hasBucket = Boolean(
    env.R2_BUCKET_BUSINESS_ASSETS?.trim() ||
    env.R2_BUCKET_GENERATED_PHOTOS?.trim() ||
    env.R2_BUCKET?.trim()
  );
  const hasKey = Boolean(env.R2_ACCESS_KEY_ID?.trim());
  const hasSecret = Boolean(env.R2_SECRET_ACCESS_KEY?.trim());
  const hasEndpoint = Boolean(env.R2_ACCOUNT_ID?.trim() || env.R2_ENDPOINT?.trim());
  return hasBucket && hasKey && hasSecret && hasEndpoint;
}

export function resolveWriteProviderName(
  env: Record<string, string | undefined>
): StorageProviderName {
  const explicit = (env.STORAGE_WRITE_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "r2" || explicit === "supabase") return explicit;
  const legacy = (env.STORAGE_PROVIDER ?? "").trim().toLowerCase();
  if (legacy === "r2") return "r2";
  return r2Configured(env) ? "r2" : "supabase";
}

/**
 * Provider fallback (bukan write) untuk resolusi objek lama. write=R2 →
 * Supabase; write=Supabase & R2 terkonfigurasi → R2 (objek era R2 tidak
 * stranded); write=Supabase & R2 absen → Supabase (single-provider).
 */
export function resolveFallbackProviderName(
  env: Record<string, string | undefined>
): StorageProviderName {
  const write = resolveWriteProviderName(env);
  if (write === "supabase") return r2Configured(env) ? "r2" : "supabase";
  return "supabase";
}
