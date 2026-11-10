/**
 * Kontrak storage provider — abstraksi terpusat (Phase 2).
 *
 * Business logic TIDAK boleh menyentuh `supabase.storage` / S3Client langsung;
 * semua lewat `StorageProvider`. Default provider = Supabase (Phase 2 belum
 * memindahkan default ke R2). Lihat `docs/09-security-storage.md`.
 *
 * Bentuk hasil sengaja meniru envelope Supabase (`{ data, error }`) supaya
 * pemindahan call-site existing tidak mengubah perilaku error-handling.
 */

import "server-only";

/** Nama bucket/area logis (identik dengan nama bucket Supabase existing). */
export type StorageBucket = "business-assets" | "generated-photos";

/**
 * Error storage. `keys` (opsional) = key yang GAGAL secara spesifik pada
 * operasi batch (mis. `DeleteObjects` R2 yang membalas 200 tapi memuat
 * `Errors[]`). Caller memakai ini agar hanya key gagal yang ditahan/di-retry,
 * bukan seluruh batch.
 */
export type StorageError = { message: string; keys?: string[] };

export type StorageResult<T> = { data: T | null; error: StorageError | null };

export type UploadOptions = {
  contentType?: string;
  upsert?: boolean;
};

/** Satu entri `list()` — objek (id non-null) atau folder (id null). */
export type StorageListEntry = {
  id: string | null;
  name: string;
  /** `lastModified` ISO — dipakai sweep objek yatim (umur objek). */
  metadata?: { size?: number; lastModified?: string } | null;
};

export type ListOptions = {
  limit?: number;
  offset?: number;
};

export type SignedUrlEntry = { path: string; signedUrl: string | null };

/**
 * Opsi presign tambahan. `download` = nama file unduhan: URL yang dibuka
 * browser merespons `Content-Disposition: attachment` dengan nama itu.
 * Diperlukan untuk tombol unduh di halaman result — atribut `download` pada
 * `<a>` cross-origin DIABAIKAN browser, jadi disposition harus dibawa oleh
 * URL signed itu sendiri (docs/05 §5.13).
 */
export type SignedUrlOptions = {
  download?: string;
};

/**
 * Interface minimal — hanya method yang benar-benar dipakai business logic.
 * JANGAN tambah method sampai ada pemanggil nyata (YAGNI).
 */
export interface StorageProvider {
  readonly name: string;
  upload(
    bucket: StorageBucket,
    key: string,
    body: Uint8Array | Buffer,
    options?: UploadOptions
  ): Promise<StorageResult<{ path: string }>>;
  remove(bucket: StorageBucket, keys: string[]): Promise<StorageResult<null>>;
  /**
   * Cek keberadaan objek (Phase 3 dual-storage). Dipakai resolver untuk
   * menentukan provider mana yang menyimpan key lama (Supabase) vs baru (R2).
   * Return: true (ada), false (tidak ada), null (error tak terduga/misconfig).
   */
  head(bucket: StorageBucket, key: string): Promise<boolean | null>;
  createSignedUrl(
    bucket: StorageBucket,
    key: string,
    ttlSeconds: number,
    options?: SignedUrlOptions
  ): Promise<StorageResult<{ signedUrl: string }>>;
  createSignedUrls(
    bucket: StorageBucket,
    keys: string[],
    ttlSeconds: number,
    options?: SignedUrlOptions
  ): Promise<StorageResult<SignedUrlEntry[]>>;
  /** Non-rekursif, urut nama asc — sama seperti Supabase `.list()`. */
  list(
    bucket: StorageBucket,
    prefix: string,
    options?: ListOptions
  ): Promise<StorageResult<StorageListEntry[]>>;
}
