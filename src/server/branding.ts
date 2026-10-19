/**
 * Branding (Photobox Builder) — docs/04 §4.8, docs/08 §8.4 (settings/branding).
 * Logo disimpan di bucket private business-assets; URL selalu signed (docs/09 §9.7).
 */

import "server-only"
import { unstable_cache, updateTag } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { ApiError } from "@/lib/api-errors"
import { can } from "@/lib/rbac"
import { getMembership } from "@/lib/tenant"
import { validateLogoFile, validateVideoFile } from "@/lib/upload-validation"
import { brandingSchema, brandingContrastIssues, kioskPageIdSchema, type BrandingInput } from "@/lib/validators"
import { SIGNED_URL_TTL_SECONDS as SIGNED_URL_TTL } from "@/lib/constants"
import {
  assertStorageAvailable,
  accountStorageAdd,
  accountStorageSub,
} from "@/server/storage-usage"
import { getStorage, resolveStorage } from "@/server/storage"
import { publicConfigCacheTag } from "@/server/public-config"
import { resetPageOverrides } from "@/lib/branding-pages"

const BRAND_ASSETS_BUCKET = "business-assets" as const
const SIGNED_URL_CACHE_TTL = 55 * 60 // 55 menit — buffer 5 menit sebelum expire

/** Tag data-cache branding (STEP 14). Dipakai getBranding + updateTag pada mutasi (Next 16). */
export const brandingCacheTag = (businessId: string) => `business:${businessId}:branding`

export type BrandingView = BrandingInput & {
  logo_url: string | null
  kiosk_video_url: string | null
}

async function requireMembership(userId: string, businessId: string, write: boolean) {
  const membership = await getMembership(userId, businessId)
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan")
  if (write && !can(membership.role, "business:update")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin mengubah branding")
  }
  return membership
}

/**
 * Pembungkus signed URL dengan cache 55 menit (buffer 5 menit sebelum expire
 * 1 jam). Tag per-key: penggantian file cukup bergantung pada key baru; entri
 * lama menjadi unreferenced dan akan expired oleh TTL. Kami tidak memanggil
 * invalidasi pada penggantian karena tag terikat ke key lama saja.
 */
function loadSignedUrl(bucket: "business-assets", key: string): Promise<string | null> {
  return unstable_cache(
    async (): Promise<string | null> => {
      // Fase 3: logo/video baru di R2, lama di Supabase — resolusi per-objek.
      const provider = await resolveStorage(bucket, key)
      const { data } = await provider.createSignedUrl(bucket, key, SIGNED_URL_TTL)
      return data?.signedUrl ?? null
    },
    ["signed-url", bucket, key],
    { tags: [`signed-url:${bucket}:${key}`], revalidate: SIGNED_URL_CACHE_TTL }
  )()
}

async function logoSignedUrl(key: string): Promise<string | null> {
  return loadSignedUrl(BRAND_ASSETS_BUCKET, key)
}

/**
 * DB read branding di-cache per business (tag `business:<id>:branding`).
 * Membership check TIDAK di-cache — harus per-user per-request.
 */
function loadBrandingRow(businessId: string): Promise<{ branding: unknown } | null> {
  return unstable_cache(
    async () => {
      const supabase = createServerClient()
      const { data } = await supabase
        .from("business_settings")
        .select("branding")
        .eq("business_id", businessId)
        .maybeSingle()
      return (data as { branding: unknown } | null) ?? null
    },
    ["branding-row", businessId],
    { tags: [brandingCacheTag(businessId)] }
  )()
}

/** Branding + logo_url signed (logo_url di-generate, tidak disimpan). */
export async function getBranding(userId: string, businessId: string): Promise<BrandingView> {
  await requireMembership(userId, businessId, false)

  // Row branding dari data-cache (tag business:<id>:branding).
  const data = await loadBrandingRow(businessId)
  if (!data) throw new ApiError("NOT_FOUND", "Settings tidak ditemukan")

  const branding = brandingSchema.catch({}).parse(data.branding ?? {})
  const [logoUrl, videoUrl] = await Promise.all([
    branding.logo_key ? logoSignedUrl(branding.logo_key) : null,
    branding.kiosk?.video_key ? logoSignedUrl(branding.kiosk.video_key) : null,
  ])
  return { ...branding, logo_url: logoUrl, kiosk_video_url: videoUrl }
}

/** PATCH branding = merge field-level (update parsial tidak boleh wipe field lain). */
export async function updateBranding(
  userId: string,
  businessId: string,
  input: BrandingInput,
  /** Layar yang override-nya harus DIHAPUS (bukan digabung). Video tetap. */
  options: { resetPages?: readonly string[] } = {}
): Promise<BrandingView> {
  const parsed = brandingSchema.parse(input)
  await requireMembership(userId, businessId, true)

  const supabase = createServerClient()
  const { data: existing } = await supabase
    .from("business_settings")
    .select("branding")
    .eq("business_id", businessId)
    .maybeSingle()
  if (!existing) throw new ApiError("NOT_FOUND", "Settings tidak ditemukan")

  const current = brandingSchema.catch({}).parse(existing.branding ?? {})
  // Deep-merge sampai level per-layar: update parsial (mis. hanya video_key
  // atau hanya bg_color) tidak boleh wipe field lain di halaman yang sama.
  const currentPages = (current.kiosk?.pages ?? {}) as Record<string, Record<string, unknown>>
  const parsedPages = (parsed.kiosk?.pages ?? {}) as Record<string, Record<string, unknown>>
  const mergedPages: Record<string, Record<string, unknown>> = { ...currentPages }
  for (const key of Object.keys(parsedPages)) {
    mergedPages[key] = { ...(currentPages[key] ?? {}), ...(parsedPages[key] ?? {}) }
  }
  // Reset per-layar: hapus seluruh override visual layar itu, sisakan video_key
  // (video punya kontrol hapus sendiri). Tanpa ini tombol "Reset layar" di
  // editor hanya tidak mengirim key, dan deep-merge justru mempertahankan
  // nilai lama — tombol terlihat berhasil tapi kiosk tak berubah.
  const afterReset = resetPageOverrides(mergedPages, options.resetPages ?? [])
  const merged = brandingSchema.parse({
    ...current,
    ...parsed,
    kiosk: {
      ...(current.kiosk ?? {}),
      ...(parsed.kiosk ?? {}),
      pages: afterReset,
    },
  })

  // Kontras divalidasi pada jalur TULIS saja (bukan read) agar data lama
  // berkontras rendah tetap bisa dimuat; di sini kita tolak dengan pesan field.
  const contrastIssues = brandingContrastIssues(
    merged as { kiosk?: { bg_color?: string; text_color?: string; pages?: Record<string, { bg_color?: string; text_color?: string } | undefined> } }
  )
  if (contrastIssues.length > 0) {
    const details: Record<string, string[]> = {}
    for (const issue of contrastIssues) {
      const key = issue.path.join(".")
      ;(details[key] ??= []).push(issue.message)
      // Sertakan juga key dangling (mis. "kiosk") agar editor bisa menampilkan.
      ;(details[issue.path[0] ?? "kiosk"] ??= []).push(issue.message)
    }
    throw new ApiError("VALIDATION_ERROR", "Kontras warna belum memenuhi standar WCAG AA.", details)
  }

  const { error } = await supabase
    .from("business_settings")
    .update({ branding: merged })
    .eq("business_id", businessId)
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan branding")

  // Invalidate data-cache branding (STEP 14) — updateTag = read-your-writes
  // (Next 16): mutasi dari server action tampil segera di request yang sama.
  updateTag(brandingCacheTag(businessId))
  // Config kiosk publik (logo/video/paket/tema) di-cache terpisah 30s — buang
  // juga agar perubahan branding langsung terlihat kiosk tanpa menunggu TTL.
  updateTag(publicConfigCacheTag(businessId))

  const [logoUrl, videoUrl] = await Promise.all([
    merged.logo_key ? logoSignedUrl(merged.logo_key) : null,
    merged.kiosk?.video_key ? logoSignedUrl(merged.kiosk.video_key) : null,
  ])
  return { ...merged, logo_url: logoUrl, kiosk_video_url: videoUrl }
}

/**
 * Upload logo → validasi (tipe/size, docs/09 §9.6) → simpan private bucket
 * dengan key random-safe → simpan logo_key di branding (bukan URL).
 */
export async function uploadLogo(
  userId: string,
  businessId: string,
  file: {
    name?: string | null
    type?: string | null
    size?: number | null
    arrayBuffer(): Promise<ArrayBuffer>
  }
): Promise<BrandingView> {
  await requireMembership(userId, businessId, true)

  const body = Buffer.from(await file.arrayBuffer())
  const check = validateLogoFile(file, body)
  if (!check.ok) throw new ApiError("VALIDATION_ERROR", check.error, { logo: [check.error] })
  await assertStorageAvailable(businessId, body.length)

  const ext = check.ext
  const key = `${businessId}/branding/logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const supabase = createServerClient()
  const { data: existing } = await supabase
    .from("business_settings")
    .select("branding")
    .eq("business_id", businessId)
    .maybeSingle()
  const oldKey = brandingSchema.catch({}).parse(existing?.branding ?? {}).logo_key ?? null

  const { error: uploadError } = await getStorage().upload(BRAND_ASSETS_BUCKET, key, body, {
    contentType: file.type ?? "application/octet-stream",
    upsert: false,
  })
  if (uploadError) throw new ApiError("INTERNAL", "Gagal mengunggah logo")
  await accountStorageAdd(businessId, BRAND_ASSETS_BUCKET, key, body.length)

  const result = await updateBranding(userId, businessId, { logo_key: key })

  // Bersihkan blob lama setelah update sukses (anti penumpukan storage).
  // ponytail: kegagalan cleanup tidak memengaruhi operasi utama — blob basi
  // dibersihkan batch nanti oleh scheduled job (storage lifecycle rule).
  if (oldKey && oldKey !== key) {
    try {
      const provider = await resolveStorage(BRAND_ASSETS_BUCKET, oldKey)
      await provider.remove(BRAND_ASSETS_BUCKET, [oldKey])
      await accountStorageSub(businessId, [oldKey])
    } catch {
      /* cleanup gagal — blob basi akan dipungut job berikutnya */
    }
  }
  return result
}

/**
 * Upload satu blob video kiosk ke bucket private → validasi (magic byte) →
 * simpan → bersihkan blob lama. Return key baru. Dipakai uploadKioskVideo
 * (global) dan uploadKioskPageVideo (per-layar) — satu jalur upload.
 */
async function uploadVideoBlob(
  userId: string,
  businessId: string,
  keyPrefix: string,
  oldKey: string | null,
  file: {
    name?: string | null
    type?: string | null
    size?: number | null
    arrayBuffer(): Promise<ArrayBuffer>
  }
): Promise<string> {
  const body = Buffer.from(await file.arrayBuffer())
  const check = validateVideoFile(file, body)
  if (!check.ok) throw new ApiError("VALIDATION_ERROR", check.error, { video: [check.error] })
  await assertStorageAvailable(businessId, body.length)

  const key = `${businessId}/branding/${keyPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${check.ext}`

  const { error: uploadError } = await getStorage().upload(BRAND_ASSETS_BUCKET, key, body, {
    contentType: file.type ?? "application/octet-stream",
    upsert: false,
  })
  if (uploadError) throw new ApiError("INTERNAL", "Gagal mengunggah video")
  await accountStorageAdd(businessId, BRAND_ASSETS_BUCKET, key, body.length)

  // Bersihkan blob lama setelah upload sukses (anti penumpukan storage).
  // ponytail: kegagalan cleanup tidak memengaruhi operasi utama — blob basi
  // dibersihkan batch nanti oleh scheduled job (storage lifecycle rule).
  if (oldKey && oldKey !== key) {
    try {
      const provider = await resolveStorage(BRAND_ASSETS_BUCKET, oldKey)
      await provider.remove(BRAND_ASSETS_BUCKET, [oldKey])
      await accountStorageSub(businessId, [oldKey])
    } catch {
      /* cleanup gagal — blob basi akan dipungut job berikutnya */
    }
  }
  return key
}

/**
 * Upload video background kiosk (maks 5 detik, looping attract screen).
 * Durasi divalidasi client (metadata video) — server memvalidasi tipe
 * (magic byte) + ukuran. ponytail: durasi server-side butuh parser MP4;
 * upgrade = parse mvhd bila perlu audit ketat.
 */
export async function uploadKioskVideo(
  userId: string,
  businessId: string,
  file: {
    name?: string | null
    type?: string | null
    size?: number | null
    arrayBuffer(): Promise<ArrayBuffer>
  }
): Promise<BrandingView> {
  await requireMembership(userId, businessId, true)

  const supabase = createServerClient()
  const { data: existing } = await supabase
    .from("business_settings")
    .select("branding")
    .eq("business_id", businessId)
    .maybeSingle()
  const oldKey = brandingSchema.catch({}).parse(existing?.branding ?? {}).kiosk?.video_key ?? null

  const key = await uploadVideoBlob(userId, businessId, "kiosk-video", oldKey, file)
  return updateBranding(userId, businessId, { kiosk: { video_key: key } })
}

/**
 * Upload video promo per-layar kiosk (mis. layar kamera awal). Durasi ≤5s
 * divalidasi client; server memvalidasi tipe + ukuran. Disimpan di
 * branding.kiosk.pages.<page>.video_key.
 */
export async function uploadKioskPageVideo(
  userId: string,
  businessId: string,
  page: string,
  file: {
    name?: string | null
    type?: string | null
    size?: number | null
    arrayBuffer(): Promise<ArrayBuffer>
  }
): Promise<BrandingView> {
  // Allowlist id layar sebelum dipakai jadi segmen key R2 (anti injeksi key storage).
  const pageId = kioskPageIdSchema.safeParse(page)
  if (!pageId.success) {
    throw new ApiError("VALIDATION_ERROR", "Layar kiosk tidak dikenal", {
      page: ["Pilih layar kiosk yang valid"],
    })
  }
  await requireMembership(userId, businessId, true)

  const supabase = createServerClient()
  const { data: existing } = await supabase
    .from("business_settings")
    .select("branding")
    .eq("business_id", businessId)
    .maybeSingle()
  const parsed = brandingSchema.catch({}).parse(existing?.branding ?? {})
  const pages = parsed.kiosk?.pages as unknown as
    Record<string, { video_key?: string | null } | undefined> | undefined
  const oldKey = pages?.[pageId.data]?.video_key ?? null

  const key = await uploadVideoBlob(userId, businessId, `kiosk-page-${pageId.data}`, oldKey, file)
  return updateBranding(userId, businessId, {
    kiosk: { pages: { [pageId.data]: { video_key: key } } },
  } as BrandingInput)
}
