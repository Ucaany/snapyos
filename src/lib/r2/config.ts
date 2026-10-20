/**
 * Cloudflare R2 client (S3-compatible) — SERVER ONLY.
 *
 * Phase 1 = fondasi saja: konfigurasi + validasi env + client siap pakai.
 * BELUM ada upload/download/presign; flow media tetap Supabase Storage.
 * Lihat `areas.ts` untuk keputusan single-bucket + prefix.
 *
 * Kredensial R2 TIDAK boleh sampai ke client bundle:
 * - Modul ini `import "server-only"` → import dari Client Component = build error.
 * - Env TIDAK memakai prefix `NEXT_PUBLIC_`, jadi tak di-inline ke bundle client.
 * - Pesan error tidak pernah memuat nilai secret (hanya nama env yang kosong).
 */

import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { r2BucketName, type R2Area, R2_BUCKET_ENV, R2_BUCKET_ENV_LEGACY } from "./areas";

const DEFAULT_REGION = "auto";

type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
};

function readEnv(): R2Env {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  // Endpoint diturunkan dari account id bila tidak di-override (mis. self-host).
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  const missing: string[] = [];
  if (!accountId && !process.env.R2_ENDPOINT?.trim()) missing.push("R2_ACCOUNT_ID");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");

  if (missing.length > 0) {
    // Nama env saja — JANGAN sertakan nilai secret/kredensial.
    throw new Error(
      `Konfigurasi R2 belum lengkap. Env yang kosong: ${missing.join(", ")} (lihat .env.example)`
    );
  }

  return { accountId, accessKeyId, secretAccessKey, endpoint };
}

let cached: S3Client | null = null;

/**
 * Ambil S3Client R2 (singleton per proses). Lazy: env divalidasi saat
 * pemanggilan pertama, bukan saat import — supaya build/import modul ini
 * tidak gagal hanya karena R2 belum dikonfigurasi.
 */
export function getR2Client(): S3Client {
  if (cached) return cached;
  const env = readEnv();
  cached = new S3Client({
    region: DEFAULT_REGION,
    endpoint: env.endpoint,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    // Cloudflare R2 mendukung path-style; lebih deterministik untuk endpoint
    // akun tanpa DNS bucket khusus.
    forcePathStyle: true,
  });
  return cached;
}

/**
 * Nama bucket R2 untuk area tertentu. Preferensi per-area
 * (`R2_BUCKET_BUSINESS_ASSETS` / `R2_BUCKET_GENERATED_PHOTOS`), fallback
 * legacy `R2_BUCKET`. Lempar bila kosong — mencegah operasi ke bucket "".
 */
export function getR2BucketForArea(area: R2Area): string {
  const name = r2BucketName(area, process.env);
  if (!name) {
    throw new Error(
      `Nama bucket R2 untuk area "${area}" belum di-set. Isi ${
        R2_BUCKET_ENV[area]
      } (atau ${R2_BUCKET_ENV_LEGACY} legacy) di .env (lihat .env.example).`
    );
  }
  return name;
}
