/**
 * Allowlist target proxy frame kiosk (`/api/v1/public/frame`) — PURE, tanpa
 * `server-only`, supaya bisa diuji langsung via node:test.
 *
 * Proxy ini hanya melayani SATU kebutuhan: kiosk memuat PNG frame template
 * supaya bisa menggambar ke canvas (docs/05 §5.9). Frame hidup di bucket privat
 * `business-assets` dan hanya bisa dibaca lewat signed URL, jadi URL yang sah
 * datang dari dua bentuk:
 *
 *   Supabase : https://<ref>.supabase.co/storage/v1/object/sign/business-assets/<key>?token=...
 *   R2       : https://<account>.r2.cloudflarestorage.com/<R2_BUCKET_BUSINESS_ASSETS>/<key>?X-Amz-...
 *
 * R2 memakai path-style (`forcePathStyle: true` di `src/lib/r2/config.ts`),
 * sehingga nama bucket fisik muncul sebagai segmen path pertama — bukan segmen
 * literal "/business-assets/". Memeriksa string literal itu membuat SETIAP
 * frame R2 ditolak 400 begitu bucket diberi nama nyata, dan kiosk lalu menolak
 * finalize karena frame gagal dimuat.
 */

export type FrameProxyEnv = Record<string, string | undefined>;

/** Origin yang boleh diproksikan: Supabase + endpoint R2 yang dikonfigurasi. */
export function allowedFrameOrigins(env: FrameProxyEnv): Set<string> {
  const origins = new Set<string>();
  for (const value of [env.SUPABASE_URL, env.R2_ENDPOINT]) {
    if (!value?.trim()) continue;
    try {
      origins.add(new URL(value.trim()).origin);
    } catch {
      continue;
    }
  }
  const accountId = env.R2_ACCOUNT_ID?.trim();
  if (accountId) origins.add(`https://${accountId}.r2.cloudflarestorage.com`);
  return origins;
}

/** Nama bucket R2 area business-assets (per-area dulu, lalu legacy `R2_BUCKET`). */
function businessAssetsBuckets(env: FrameProxyEnv): string[] {
  return [env.R2_BUCKET_BUSINESS_ASSETS, env.R2_BUCKET]
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));
}

/** Path objek Supabase Storage (bentuk `<project>/storage/v1/object/...`). */
function isSupabaseObjectPath(pathname: string): boolean {
  return pathname.includes("/storage/v1/object/");
}

/** Path objek R2 path-style — segmen pertama = nama bucket business-assets.
 *  Key wajib ada: path bucket-saja (`/<bucket>`) adalah endpoint ListObjects,
 *  bukan objek, dan tidak boleh diteruskan proxy ini. */
function isR2ObjectPath(pathname: string, env: FrameProxyEnv): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  return businessAssetsBuckets(env).includes(segments[0]!);
}

/** http hanya boleh di non-production (endpoint R2 self-host / dev lokal). */
function isAllowedProtocol(protocol: string, env: FrameProxyEnv): boolean {
  if (protocol === "https:") return true;
  return protocol === "http:" && env.NODE_ENV !== "production";
}

/** True bila `target` boleh diambil proxy ini (origin, skema, dan path objek). */
export function isAllowedFrameTarget(target: URL, env: FrameProxyEnv): boolean {
  if (!allowedFrameOrigins(env).has(target.origin)) return false;
  if (!isAllowedProtocol(target.protocol, env)) return false;
  if (target.username || target.password) return false;
  return isSupabaseObjectPath(target.pathname) || isR2ObjectPath(target.pathname, env);
}
