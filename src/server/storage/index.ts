/**
 * Storage service (factory) — titik masuk tunggal business logic.
 *
 * Fase 3 (dual-storage):
 * - WRITE (upload baru) → `getWriteStorage()` = R2 (default), dapat di-override
 *   via `STORAGE_WRITE_PROVIDER` (fallback `STORAGE_PROVIDER`, lalu `r2`).
 * - READ/DELETE objek existing → `resolveStorage(bucket, key)` memilih provider
 *   yang BENAR-BENAR menyimpan objek: write-provider dulu, lalu Supabase.
 *   Key identik antar provider (lihat `src/lib/r2/areas.ts`) sehingga provider
 *   tak bisa ditebak dari key — resolusi memakai `head()` + cache per-proses.
 * - `getStorage()` tetap ada dan mengembalikan provider WRITE (kompatibilitas
 *   call-site lama). Call-site read/delete HARUS lewat `resolveStorage`.
 *
 * Lima media flow (upload/list/signed URL/delete) tetap identik perilakunya;
 * yang berubah hanya provider aktif. Bucket tetap PRIVATE (tidak ada public
 * bucket) — signed URL tetap satu-satunya jalur baca.
 */

import "server-only";
import { SupabaseStorageProvider } from "./supabase-provider";
import { R2StorageProvider } from "./r2-provider";
import { resolveWriteProviderName, resolveFallbackProviderName } from "@/lib/r2/provider";
import { StorageResolver } from "@/lib/r2/resolver";
import type { StorageBucket, StorageProvider } from "./types";

export type { StorageProvider, StorageBucket } from "./types";

let cachedWrite: StorageProvider | null = null;
let cachedSupabase: SupabaseStorageProvider | null = null;
let cachedR2: R2StorageProvider | null = null;
let resolver: StorageResolver | null = null;

function buildProvider(name: string): StorageProvider {
  return name === "r2" ? new R2StorageProvider() : new SupabaseStorageProvider();
}

/** Provider UPLOAD (singleton per proses). */
export function getWriteStorage(): StorageProvider {
  if (cachedWrite) return cachedWrite;
  cachedWrite = buildProvider(resolveWriteProviderName(process.env));
  return cachedWrite;
}

/** Provider Supabase eksplisit — untuk fallback read/delete objek lama. */
export function getSupabaseStorage(): SupabaseStorageProvider {
  if (!cachedSupabase) cachedSupabase = new SupabaseStorageProvider();
  return cachedSupabase;
}

/** Provider R2 eksplisit (singleton) — hanya dibangun bila env R2 lengkap. */
function getR2Storage(): R2StorageProvider {
  if (!cachedR2) cachedR2 = new R2StorageProvider();
  return cachedR2;
}

/**
 * Fallback resolver = provider yang BUKAN write, agar objek lama di provider
 * lain tetap teresolusi. Bila write=R2 → Supabase; bila write=Supabase DAN R2
 * terkonfigurasi → R2 (objek era R2 tidak boleh stranded); bila write=Supabase
 * dan R2 tidak dikonfigurasi → Supabase (mode single-provider).
 */
function fallbackProvider(writeName: string): StorageProvider {
  // Sumber kebenaran = resolver pure (teruji); writeName sudah dihitung dari env.
  const name = resolveFallbackProviderName(process.env);
  if (name === "r2" && writeName === "supabase") return getR2Storage();
  return getSupabaseStorage();
}

/**
 * Semua provider storage yang terkonfigurasi, untuk accounting kuota.
 * Selalu sertakan provider write + fallback (R2 bila terkonfigurasi), dedup
 * bila keduanya provider yang sama. Menjamin bytes R2 tidak hilang walau
 * write-provider di-set ke Supabase.
 */
export function activeStorageProviders(): StorageProvider[] {
  const write = getWriteStorage();
  const fallback = fallbackProvider(write.name);
  return write.name === fallback.name ? [write] : [write, fallback];
}

/**
 * Kompatibilitas call-site lama — provider aktif (write). Call-site read/delete
 * sebaiknya memakai `resolveStorage` agar objek Supabase lama tetap terbaca.
 */
export function getStorage(): StorageProvider {
  return getWriteStorage();
}

function getResolver(): StorageResolver {
  if (!resolver) {
    const write = getWriteStorage();
    resolver = new StorageResolver(write, fallbackProvider(write.name));
  }
  return resolver;
}

/**
 * Resolusi provider yang menyimpan `bucket/key`. Urutan: write-provider dulu
 * (objek baru), lalu Supabase (objek lama). Bila tidak ada di keduanya,
 * kembalikan write-provider (agar error/URL mengikuti perilaku upload).
 * Logika inti ada di `src/lib/r2/resolver.ts` (pure, teruji).
 */
export async function resolveStorage(
  bucket: StorageBucket,
  key: string
): Promise<StorageProvider> {
  const provider = await getResolver().resolve(bucket, key);
  return provider as StorageProvider;
}

/** Resolusi batch — satu provider per key, memakai cache (anti N+1 HEAD). */
async function resolveStorageMany(
  bucket: StorageBucket,
  keys: string[]
): Promise<Map<string, StorageProvider>> {
  const write = getWriteStorage();
  const fallback = fallbackProvider(write.name);
  const map = new Map<string, StorageProvider>();
  if (write.name === fallback.name) {
    for (const k of keys) map.set(k, write);
    return map;
  }
  await Promise.all(
    keys.map(async (k) => {
      map.set(k, await resolveStorage(bucket, k));
    })
  );
  return map;
}

/**
 * Batch signed URL lintas-provider: resolusi tiap key, kelompokkan per provider,
 * satu `createSignedUrls` per provider. Map key→signedUrl (null bila gagal).
 */
export async function signedUrlMap(
  bucket: StorageBucket,
  keys: string[],
  ttlSeconds: number
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(keys));
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const byProvider = await resolveStorageMany(bucket, unique);
  const groups = new Map<StorageProvider, string[]>();
  for (const key of unique) {
    const provider = byProvider.get(key) ?? getWriteStorage();
    const list = groups.get(provider) ?? [];
    list.push(key);
    groups.set(provider, list);
  }
  await Promise.all(
    Array.from(groups.entries()).map(async ([provider, groupKeys]) => {
      const { data } = await provider.createSignedUrls(bucket, groupKeys, ttlSeconds);
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl) out.set(entry.path, entry.signedUrl);
      }
    })
  );
  return out;
}

/**
 * Hapus objek dengan resolusi provider per-key (anti salah-bucket).
 *
 * Keamanan data:
 * - `present`  → hapus di provider pemilik.
 * - `absent`   → sudah tidak ada di provider mana pun (kedua `head`=false) →
 *                dianggap sukses (tidak perlu hapus apa pun).
 * - `unknown`  → ada provider error → JANGAN klaim sukses; kembalikan error
 *                agar caller (mis. cron retention) menahan baris DB & retry.
 *
 * Abort-awal (bail on first error): dipakai call-site yang memperlakukan batch
 * sebagai satu unit atomik (single template, dll). Untuk batch besar yang harus
 * tahan gangguan satu objek, pakai `removeResolvedOutcome`.
 */
export async function removeResolved(
  bucket: StorageBucket,
  keys: string[]
): Promise<{ message: string } | null> {
  const { failures } = await removeResolvedOutcome(bucket, keys);
  return failures[0] ?? null;
}

/**
 * Hapus objek per-key TANPA membatalkan seluruh batch saat satu key gagal
 * (cron retention: satu object failure tidak boleh merusak batch).
 *
 * Kembalikan:
 * - `ok`       — key yang pasti terhapus atau sudah absen (idempotent).
 * - `failures` — key yang gagal dihapus / status tak pasti (`unknown` / error
 *                provider) → caller menahan baris DB untuk key ini & retry.
 *
 * Resolusi + grouping per provider (satu `remove` per provider). Kegagalan
 * `remove` satu provider hanya menandai key di grup itu; grup provider lain
 * tetap lanjut. Missing object = sukses (idempotent).
 */
export async function removeResolvedOutcome(
  bucket: StorageBucket,
  keys: string[]
): Promise<{ ok: string[]; failures: { key: string; message: string }[] }> {
  const ok: string[] = [];
  const failures: { key: string; message: string }[] = [];
  if (keys.length === 0) return { ok, failures };

  const resolver = getResolver();
  const groups = new Map<StorageProvider, string[]>();
  for (const key of keys) {
    const outcome = await resolver.resolveOutcome(bucket, key);
    if (outcome.status === "unknown") {
      failures.push({ key, message: "Status objek tidak dapat dipastikan (provider error)" });
      continue;
    }
    if (outcome.status === "absent") {
      ok.push(key);
      continue;
    }
    const typed = outcome.provider as StorageProvider;
    const list = groups.get(typed) ?? [];
    list.push(key);
    groups.set(typed, list);
  }

  for (const [provider, groupKeys] of groups) {
    const { error } = await provider.remove(bucket, groupKeys);
    if (error) {
      for (const key of groupKeys) failures.push({ key, message: error.message });
    } else {
      ok.push(...groupKeys);
    }
  }
  return { ok, failures };
}

/** Reset singleton + cache — HANYA untuk test. */
export function resetStorageForTest(): void {
  cachedWrite = null;
  cachedSupabase = null;
  cachedR2 = null;
  resolver = null;
}
