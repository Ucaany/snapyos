/**
 * R2StorageProvider — Cloudflare R2 (S3-compatible) via @aws-sdk/client-s3.
 *
 * Phase 2: provider TERSEDIA tapi BUKAN default. Belum ada migrasi object;
 * hanya diuji via mock/test. Satu bucket R2 + prefix area (lihat
 * `src/lib/r2/areas.ts`) → key DB existing dipakai apa adanya di bawah prefix.
 *
 * Catatan kompatibilitas Supabase `.list()`:
 * - Supabase mengembalikan objek & folder pada level yang sama; folder = id null.
 * - R2 ListObjectsV2 butuh delimiter untuk memisahkan folder (CommonPrefixes);
 *   objek langsung → id = key, folder → id = null. Nama folder = segmen terakhir.
 * - Hasil digabung lalu diurutkan by name (asc) agar paritas dengan
 *   Supabase `.list(sortBy name)`.
 *
 * Catatan paritas Phase 2 → Phase 3 (R2 BELUM default):
 * - `upload({ upsert:false })` ditegakkan via HeadObject (gagal bila key ada),
 *   meniru semantik Supabase. `upsert:true` → PutObject menimpa.
 * - `createSignedUrls` membatasi konkurensi presign (PresignConcurrency).
 */

import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2BucketForArea, getR2Client, r2Key } from "@/lib/r2";
import type {
  ListOptions,
  SignedUrlEntry,
  StorageBucket,
  StorageListEntry,
  StorageProvider,
  StorageResult,
  UploadOptions,
} from "./types";

/** Batas presign paralel — cegah fan-out tak terbatas saat key banyak. */
const PRESIGN_CONCURRENCY = 50;

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isNotFoundError(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  const code = (error as { name?: string })?.name;
  return status === 404 || code === "NotFound" || code === "NoSuchKey";
}

/** Jalankan task dengan konkurensi terbatas, urutan hasil dijaga. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export class R2StorageProvider implements StorageProvider {
  readonly name = "r2";

  private client: S3Client;

  /**
   * @param client — injeksi client untuk test (mock). Default: client R2
   *   singleton (env divalidasi lazy saat pertama dipakai).
   */
  constructor(client?: S3Client) {
    this.client = client ?? getR2Client();
  }

  private bucket(bucket: StorageBucket): string {
    return getR2BucketForArea(bucket);
  }

  async upload(
    bucket: StorageBucket,
    key: string,
    body: Uint8Array | Buffer,
    options: UploadOptions = {}
  ): Promise<StorageResult<{ path: string }>> {
    const objectKey = r2Key(bucket, key);
    try {
      // upsert:false (default Supabase) → tolak bila key sudah ada.
      if (!options.upsert) {
        try {
          await this.client.send(
            new HeadObjectCommand({ Bucket: this.bucket(bucket), Key: objectKey })
          );
          return { data: null, error: { message: "Object already exists" } };
        } catch (error) {
          if (!isNotFoundError(error)) throw error;
        }
      }
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket(bucket),
          Key: objectKey,
          Body: body,
          ContentType: options.contentType,
        })
      );
      return { data: { path: key }, error: null };
    } catch (error) {
      return { data: null, error: { message: messageFrom(error) } };
    }
  }

  async remove(bucket: StorageBucket, keys: string[]): Promise<StorageResult<null>> {
    if (keys.length === 0) return { data: null, error: null };
    try {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket(bucket),
          Delete: { Objects: keys.map((k) => ({ Key: r2Key(bucket, k) })) },
        })
      );
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: { message: messageFrom(error) } };
    }
  }

  async head(bucket: StorageBucket, key: string): Promise<boolean | null> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket(bucket), Key: r2Key(bucket, key) })
      );
      return true;
    } catch (error) {
      // 404/NotFound/NoSuchKey = objek tidak ada, bukan misconfiguration.
      if (isNotFoundError(error)) return false;
      return null;
    }
  }

  async createSignedUrl(
    bucket: StorageBucket,
    key: string,
    ttlSeconds: number
  ): Promise<StorageResult<{ signedUrl: string }>> {
    try {
      const signedUrl = await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket(bucket), Key: r2Key(bucket, key) }),
        { expiresIn: ttlSeconds }
      );
      return { data: { signedUrl }, error: null };
    } catch (error) {
      return { data: null, error: { message: messageFrom(error) } };
    }
  }

  async createSignedUrls(
    bucket: StorageBucket,
    keys: string[],
    ttlSeconds: number
  ): Promise<StorageResult<SignedUrlEntry[]>> {
    try {
      const entries = await mapWithConcurrency(keys, PRESIGN_CONCURRENCY, async (key) => {
        const signedUrl = await getSignedUrl(
          this.client,
          new GetObjectCommand({ Bucket: this.bucket(bucket), Key: r2Key(bucket, key) }),
          { expiresIn: ttlSeconds }
        );
        return { path: key, signedUrl };
      });
      return { data: entries, error: null };
    } catch (error) {
      return { data: null, error: { message: messageFrom(error) } };
    }
  }

  async list(
    bucket: StorageBucket,
    prefix: string,
    options: ListOptions = {}
  ): Promise<StorageResult<StorageListEntry[]>> {
    const limit = options.limit ?? 100;
    const requestedOffset = options.offset ?? 0;
    // Prefix R2 selalu berakhiran "/" untuk folder; "" (root area) tetap prefix area.
    const areaPrefix = r2Key(bucket, "");
    const fullPrefix = prefix
      ? `${areaPrefix}${prefix.replace(/^\/+/, "")}/`
      : areaPrefix;
    try {
      // Kumpulkan SEMUA entri pada level ini (folder + objek), lalu urutkan by
      // name — paritas dengan Supabase `.list(sortBy name)`. Offset/limit
      // diterapkan setelah sort. Jumlah anak langsung per prefix kecil
      // (per business/per session), jadi tidak ada masalah memori.
      const all: StorageListEntry[] = [];
      let token: string | undefined;
      for (;;) {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket(bucket),
            Prefix: fullPrefix,
            Delimiter: "/",
            ContinuationToken: token,
          })
        );
        for (const cp of page.CommonPrefixes ?? []) {
          if (!cp.Prefix) continue;
          const name = cp.Prefix.slice(fullPrefix.length).replace(/\/$/, "");
          if (name) all.push({ id: null, name, metadata: null });
        }
        for (const obj of page.Contents ?? []) {
          // Objek placeholder folder (key berakhir "/") dilewati.
          if (!obj.Key || obj.Key === fullPrefix || obj.Key.endsWith("/")) continue;
          all.push({
            id: obj.Key,
            name: obj.Key.slice(fullPrefix.length),
            metadata: { size: obj.Size ?? 0 },
          });
        }
        if (!page.IsTruncated || !page.NextContinuationToken) break;
        token = page.NextContinuationToken;
      }
      all.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return { data: all.slice(requestedOffset, requestedOffset + limit), error: null };
    } catch (error) {
      return { data: null, error: { message: messageFrom(error) } };
    }
  }
}
