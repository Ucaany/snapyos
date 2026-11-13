/**
 * Konstanta shared lintas modul (Fase 5 — dedup magic number).
 *
 * Nilai berikut TIDAK boleh diubah tanpa cross-check ke docs/09 (session
 * cookie), docs/04 (branding regenerate), dan docs/06 (payment status
 * polling). Bila butuh perpanjang TTL: perbarui `revalidate` /
 * `createSignedUrl` yang bersangkutan.
 */

/** TTL default untuk `supabase.storage.createSignedUrl` (docs/09 §9). */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Absolute session lifetime — Auth.js session cookie (docs/09 §10). */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Idle timeout — sesi tanpa aktivitas berakhir walau cookie belum kedaluwarsa
 * (AUTH-02). Diperbarui di JWT callback dengan throttle agar tidak menulis
 * cookie di setiap request.
 */
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;

/** Throttle update `lastSeen` (5 menit) — mengurangi write cookie. */
export const SESSION_IDLE_REFRESH_MS = 5 * 60_000;

/** Revalidate default untuk endpoint statis (mis. emoji catalog). */
export const REVALIDATE_ONE_HOUR = 60 * 60;
