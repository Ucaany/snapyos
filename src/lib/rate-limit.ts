/**
 * Rate limiter fixed-window in-memory.
 * Kebijakan: docs/08 §8.18 + docs/09 §10 (login 5/menit/IP, lockout per email).
 *
 * Counter hidup di memori proses. Di deployment multi-instance (Vercel), tiap
 * instance punya hitungan sendiri, jadi limit efektif = limit × jumlah instance
 * yang sedang melayani. Untuk satu proses (VPS systemd) hitungannya utuh.
 */

import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function sweep(now: number) {
  // TTL berbasis waktu: sapu tiap 60 detik ATAU saat size besar, bukan hanya size.
  const lastSweepAt = (sweep as unknown as { last?: number }).last ?? 0;
  if (buckets.size < 10_000 && now - lastSweepAt < 60_000) return;
  (sweep as unknown as { last?: number }).last = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function inMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Rate limit fixed-window. Async agar call-site tidak perlu berubah bila
 * backend suatu saat dipindah keluar proses.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterSec: number }> {
  return inMemoryRateLimit(key, limit, windowMs);
}

/** Increment hitungan gagal (lockout per email — docs/09 §10). */
export async function registerFailure(key: string, windowMs: number): Promise<number> {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

/**
 * Baca hitungan gagal TANPA menambahnya, untuk menegakkan lockout sebagai
 * gate sebelum verifikasi (percobaan ke-N tidak menyentuh DB/argon2 sama
 * sekali).
 */
export async function failureCount(key: string): Promise<number> {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return 0;
  return bucket.count;
}

/**
 * Rate-limit tambahan berskala device (per booth), BUKAN pengganti limit IP.
 * Banyak booth di belakang satu NAT berbagi bucket IP — pembatas ini memakai
 * prefix hash device_token sehingga traffic satu booth tidak menstarvasi booth
 * lain, sementara limit IP existing tetap berlaku sebagai lapis kedua.
 *
 * Hanya `prefix` token yang di-hash (bukan token penuh) agar key limiter tidak
 * menyimpan bearer credential; token tidak reversibel dari hash ini.
 * Return null bila token tidak ada (route tetap jalan dengan limit IP saja).
 */
export async function rateLimitByDevice(
  route: string,
  deviceToken: string | null | undefined,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterSec: number } | null> {
  if (!deviceToken) return null;
  const prefix = deviceToken.slice(0, 16);
  const key = `${route}:device:${createHash("sha256").update(prefix).digest("hex").slice(0, 24)}`;
  return rateLimit(key, limit, windowMs);
}

/** Hapus bucket (reset hitungan setelah sukses). */
export async function resetLimit(key: string): Promise<void> {
  buckets.delete(key);
}
