/**
 * Resolusi provider baca/hapus dual-storage (PURE, tanpa `server-only`) — Fase 3.
 *
 * Objek SnapyOS memakai key identik di Supabase maupun R2 (`src/lib/r2/areas.ts`)
 * sehingga provider tidak bisa ditentukan dari key. Resolusi memakai probe
 * `head()`: write-provider dulu (objek baru), lalu Supabase (objek lama).
 * Modul ini murni (menerima provider sebagai argumen) agar dapat diuji tanpa
 * kredensial; `src/server/storage/index.ts` adalah pembungkus singleton-nya.
 */

export type ProbeResult = boolean | null;

/**
 * Hasil resolusi:
 * - `present`    — provider + sudah dikonfirmasi ada (head===true).
 * - `absent`     — kedua provider menjawab tegas "tidak ada" (head===false)
 *                  → aman dianggap tidak ada (mis. blob sudah terhapus).
 * - `unknown`    — ada provider yang error/tidak bisa dipastikan (head===null)
 *                  → JANGAN hapus baris DB; retry nanti.
 */
export type ResolveOutcome =
  { status: "present"; provider: ProbeableProvider } | { status: "absent" } | { status: "unknown" };

/** Permukaan provider yang dibutuhkan resolver (subset StorageProvider). */
export interface ProbeableProvider {
  readonly name: string;
  head(bucket: string, key: string): Promise<ProbeResult>;
}

const MISS = "__miss__";
const HIT_TTL_MS = 10 * 60 * 1000;

type CacheEntry = { provider: string; at: number; miss: boolean };

export class StorageResolver {
  private cache = new Map<string, CacheEntry>();
  private write: ProbeableProvider;
  private fallback: ProbeableProvider;
  private now: () => number;

  constructor(write: ProbeableProvider, fallback: ProbeableProvider, now: () => number = Date.now) {
    this.write = write;
    this.fallback = fallback;
    this.now = now;
  }

  /** Provider yang menyimpan `bucket/key`; fallback ke write bila tak ketemu. */
  async resolve(bucket: string, key: string): Promise<ProbeableProvider> {
    const outcome = await this.resolveOutcome(bucket, key);
    return outcome.status === "present" ? outcome.provider : this.write;
  }

  /**
   * Resolusi terperinci untuk jalur delete/cron: bedakan `present` (hapus di
   * provider itu), `absent` (kedua provider tegas tidak ada → aman dibersihkan
   * barisnya), dan `unknown` (ada provider error → JANGAN klaim sukses).
   */
  async resolveOutcome(bucket: string, key: string): Promise<ResolveOutcome> {
    // Tidak ada dual-storage → provider tunggal dianggap pemilik pasti.
    if (this.write.name === this.fallback.name) {
      return { status: "present", provider: this.write };
    }

    const cacheKey = `${bucket}\u0000${key}`;
    const hit = this.cache.get(cacheKey);
    if (hit && this.now() - hit.at < HIT_TTL_MS) {
      if (hit.miss) return { status: "absent" };
      return {
        status: "present",
        provider: hit.provider === this.fallback.name ? this.fallback : this.write,
      };
    }

    const inWrite = await this.write.head(bucket, key);
    if (inWrite === true) {
      this.cache.set(cacheKey, { provider: this.write.name, at: this.now(), miss: false });
      return { status: "present", provider: this.write };
    }

    const inFallback = await this.fallback.head(bucket, key);
    if (inFallback === true) {
      this.cache.set(cacheKey, { provider: this.fallback.name, at: this.now(), miss: false });
      return { status: "present", provider: this.fallback };
    }

    // Kedua `head` mengembalikan false → benar-benar tidak ada.
    if (inWrite === false && inFallback === false) {
      this.cache.set(cacheKey, { provider: MISS, at: this.now(), miss: true });
      return { status: "absent" };
    }

    // Ada null (error/tidak pasti) → jangan hapus baris DB.
    return { status: "unknown" };
  }

  clear(): void {
    this.cache.clear();
  }
}
