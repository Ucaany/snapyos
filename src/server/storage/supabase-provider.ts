/**
 * SupabaseStorageProvider — implementasi default (Phase 2).
 *
 * Thin wrapper di atas `supabase.storage.from(bucket)` existing; TIDAK
 * mengubah key, bucket, maupun semantik (upsert, signed TTL, list paging).
 * Perilaku harus identik dengan pemakaian langsung sebelumnya.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import type {
  ListOptions,
  SignedUrlEntry,
  SignedUrlOptions,
  StorageBucket,
  StorageListEntry,
  StorageProvider,
  StorageResult,
  UploadOptions,
} from "./types";

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase";

  async upload(
    bucket: StorageBucket,
    key: string,
    body: Uint8Array | Buffer,
    options: UploadOptions = {}
  ): Promise<StorageResult<{ path: string }>> {
    const supabase = createServerClient();
    const { error } = await supabase.storage.from(bucket).upload(key, body, {
      contentType: options.contentType,
      upsert: options.upsert ?? false,
    });
    if (error) return { data: null, error: { message: error.message } };
    return { data: { path: key }, error: null };
  }

  async remove(bucket: StorageBucket, keys: string[]): Promise<StorageResult<null>> {
    const supabase = createServerClient();
    const { error } = await supabase.storage.from(bucket).remove(keys);
    if (error) return { data: null, error: { message: error.message } };
    return { data: null, error: null };
  }

  /**
   * Supabase Storage tidak punya HEAD; pakai `.list(parent, { search })` dan
   * cari nama persis (basename). `search` = filter SUBSTRING, jadi limit besar
   * + cari exact-name (bukan `limit:1` yang bisa salah baris saat ada sibling
   * ber-nama superset). Folder punya id null — objek nyata id non-null.
   */
  async head(bucket: StorageBucket, key: string): Promise<boolean | null> {
    const supabase = createServerClient();
    const slash = key.lastIndexOf("/");
    const dir = slash >= 0 ? key.slice(0, slash) : "";
    const name = slash >= 0 ? key.slice(slash + 1) : key;
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(dir, { limit: 1000, search: name });
    if (error) return null;
    return (data ?? []).some((it) => it.name === name && it.id !== null);
  }

  async createSignedUrl(
    bucket: StorageBucket,
    key: string,
    ttlSeconds: number,
    options?: SignedUrlOptions
  ): Promise<StorageResult<{ signedUrl: string }>> {
    const supabase = createServerClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, ttlSeconds, {
      ...(options?.download !== undefined ? { download: options.download } : {}),
    });
    if (error) return { data: null, error: { message: error.message } };
    if (!data?.signedUrl) return { data: null, error: { message: "signed URL kosong" } };
    return { data: { signedUrl: data.signedUrl }, error: null };
  }

  async createSignedUrls(
    bucket: StorageBucket,
    keys: string[],
    ttlSeconds: number,
    options?: SignedUrlOptions
  ): Promise<StorageResult<SignedUrlEntry[]>> {
    const supabase = createServerClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(keys, ttlSeconds, {
      ...(options?.download !== undefined ? { download: options.download } : {}),
    });
    if (error) return { data: null, error: { message: error.message } };
    const entries: SignedUrlEntry[] = (data ?? []).map((s) => ({
      path: s.path ?? "",
      signedUrl: s.signedUrl ?? null,
    }));
    return { data: entries, error: null };
  }

  async list(
    bucket: StorageBucket,
    prefix: string,
    options: ListOptions = {}
  ): Promise<StorageResult<StorageListEntry[]>> {
    const supabase = createServerClient();
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) return { data: null, error: { message: error.message } };
    const items: StorageListEntry[] = (data ?? []).map((it) => ({
      id: it.id ?? null,
      name: it.name,
      metadata: it.metadata as { size?: number } | null,
    }));
    return { data: items, error: null };
  }
}
