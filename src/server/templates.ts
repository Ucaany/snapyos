/**
 * Template CRUD + upload frame — docs/04 §4.10, docs/08 §8.7.
 * File di bucket private business-assets; preview via signed URL (docs/09).
 * MVP = upload frame sendiri (PNG/JPG/WebP transparan) + kelola + assign (§4.10.1).
 */

import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { ApiError } from "@/lib/api-errors"
import { can, type Permission } from "@/lib/rbac"
import { getMembership } from "@/lib/tenant"
import { LOGO_ALLOWED_TYPES, sniffImageType } from "@/lib/upload-validation"
import {
  templateCreateSchema,
  templateUpdateSchema,
  type TemplateCreateInput,
  type TemplateUpdateInput,
} from "@/lib/validators"
import { slotCount, type TemplateLayout } from "@/lib/template-layout"
import { staleTemplateKeys, staleThumbnailKeys } from "@/lib/template-cleanup"
import { SIGNED_URL_TTL_SECONDS as SIGNED_URL_TTL } from "@/lib/constants"
import {
  assertStorageAvailable,
  accountStorageAdd,
  accountStorageSub,
} from "@/server/storage-usage"
import { getStorage, resolveStorage, signedUrlMap, removeResolved } from "@/server/storage"

const BUCKET = "business-assets"
const TEMPLATE_MAX_BYTES = 5 * 1024 * 1024 // 5 MB (docs/04 §4.10)

const COLUMNS =
  "id, name, category, file_url, thumbnail_url, layout, is_active, created_at"

export type TemplateRow = {
  id: string
  name: string
  category: string
  file_url: string
  is_active: boolean
  created_at: string
  preview_url: string | null
  /** layout jsonb mentah — null/{} = template legacy (docs/15 §15.2). */
  layout: TemplateLayout | Record<string, never> | null
  slot_count: number
}

async function requireMembership(userId: string, businessId: string, permission: Permission) {
  const membership = await getMembership(userId, businessId)
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan")
  if (!can(membership.role, permission)) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin untuk aksi ini")
  }
  return membership
}

export function validateFrameFile(
  file: {
    name?: string | null
    type?: string | null
    size?: number | null
  },
  bytes?: Uint8Array | null
): { ok: true; ext: string } | { ok: false; error: string } {
  const type = (file.type ?? "").toLowerCase()
  if (!file.name) return { ok: false, error: "File tidak terbaca" }
  if (!LOGO_ALLOWED_TYPES[type]) {
    return { ok: false, error: "Frame harus PNG, JPG, atau WebP" }
  }
  if ((file.size ?? 0) <= 0) return { ok: false, error: "File kosong" }
  if ((file.size ?? 0) > TEMPLATE_MAX_BYTES) {
    return { ok: false, error: "Ukuran frame maksimal 5 MB" }
  }
  if (bytes && sniffImageType(bytes) !== type) {
    return { ok: false, error: "Konten file tidak cocok dengan tipe yang diklaim" }
  }
  return { ok: true, ext: LOGO_ALLOWED_TYPES[type] }
}

type TemplateDbRow = {
  id: string
  name: string
  category: string
  file_url: string
  thumbnail_url: string | null
  layout: unknown
  is_active: boolean
  created_at: string
}

async function toTemplateRow(row: TemplateDbRow): Promise<TemplateRow> {
  const provider = await resolveStorage(BUCKET, row.file_url)
  const { data: signed } = await provider.createSignedUrl(BUCKET, row.file_url, SIGNED_URL_TTL)
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    file_url: row.file_url,
    is_active: row.is_active,
    created_at: row.created_at,
    preview_url: signed?.signedUrl ?? null,
    layout: (row.layout ?? {}) as TemplateRow["layout"],
    slot_count: slotCount(row.layout),
  }
}

export async function listTemplates(
  userId: string,
  businessId: string,
  options: { includeInactive?: boolean } = {}
): Promise<TemplateRow[]> {
  await requireMembership(userId, businessId, "template:read")
  const supabase = createServerClient()
  let req = supabase
    .from("templates")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
  if (!options.includeInactive) req = req.eq("is_active", true)

  const { data, error } = await req
  if (error) throw new ApiError("INTERNAL", "Gagal memuat templates")

  const rows = (data ?? []) as TemplateDbRow[]

  // Template global premium yang sudah dibeli business ini ikut tampil di
  // daftar (docs/15 §15.9b) — "jika dibeli otomatis muncul & bisa dipakai".
  const { data: owned } = await supabase
    .from("business_template_purchases")
    .select("template_id")
    .eq("business_id", businessId)
  const ownedIds = ((owned ?? []) as { template_id: string }[]).map((o) => o.template_id)
  if (ownedIds.length > 0) {
    const { data: global } = await supabase
      .from("templates")
      .select(COLUMNS)
      .is("business_id", null)
      .in("id", ownedIds)
    rows.push(...((global ?? []) as TemplateDbRow[]))
  }

  // Batch signed URLs — single storage call for all keys.
  const keys = Array.from(
    new Set(
      rows.flatMap((r) => {
        const ks = [r.file_url]
        return ks
      })
    )
  )
  const urlByKey = await signedUrlMap(BUCKET, keys, SIGNED_URL_TTL)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    file_url: row.file_url,
    is_active: row.is_active,
    created_at: row.created_at,
    preview_url: urlByKey.get(row.file_url) ?? null,
    layout: (row.layout ?? {}) as TemplateRow["layout"],
    slot_count: slotCount(row.layout),
  }))
}

/** Satu template untuk builder — docs/15 §15.3. */
export async function getTemplate(
  userId: string,
  businessId: string,
  templateId: string
): Promise<TemplateRow> {
  await requireMembership(userId, businessId, "template:read")
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("templates")
    .select(COLUMNS)
    .eq("id", templateId)
    .eq("business_id", businessId)
    .maybeSingle()
  if (error) throw new ApiError("INTERNAL", "Gagal memuat template")
  if (!data) throw new ApiError("NOT_FOUND", "Template tidak ditemukan")
  return toTemplateRow(data as TemplateDbRow)
}

export async function uploadTemplate(
  userId: string,
  businessId: string,
  file: {
    name?: string | null
    type?: string | null
    size?: number | null
    arrayBuffer(): Promise<ArrayBuffer>
  },
  meta: { name: string; category: TemplateCreateInput["category"] }
) {
  await requireMembership(userId, businessId, "template:write")
  const body = Buffer.from(await file.arrayBuffer())
  const check = validateFrameFile(file, body)
  if (!check.ok) {
    throw new ApiError("VALIDATION_ERROR", check.error, { file: [check.error] })
  }
  await assertStorageAvailable(businessId, body.length)
  const parsed = templateCreateSchema.parse({
    name: meta.name,
    category: meta.category,
    file_url: "pending",
  })

  const key = `${businessId}/templates/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${check.ext}`
  const supabase = createServerClient()
  const { error: uploadError } = await getStorage().upload(BUCKET, key, body, {
    contentType: file.type ?? "application/octet-stream",
    upsert: false,
  })
  if (uploadError) throw new ApiError("INTERNAL", "Gagal mengunggah frame")
  await accountStorageAdd(businessId, BUCKET, key, body.length)

  const { data, error } = await supabase
    .from("templates")
    .insert({
      business_id: businessId,
      name: parsed.name,
      category: parsed.category,
      file_url: key,
      thumbnail_url: key,
      is_active: true,
    })
    .select(COLUMNS)
    .single()
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan template")
  return data
}

export async function updateTemplate(
  userId: string,
  businessId: string,
  templateId: string,
  input: TemplateUpdateInput
) {
  const parsed = templateUpdateSchema.parse(input)
  await requireMembership(userId, businessId, "template:write")
  const supabase = createServerClient()
  // Kolom NOT NULL — layout null (kembali ke legacy) disimpan sebagai '{}';
  // layout undefined (tidak dikirim) tidak menyentuh kolom.
  const patch = parsed.layout === undefined ? parsed : { ...parsed, layout: parsed.layout ?? {} }
  const { data, error } = await supabase
    .from("templates")
    .update(patch)
    .eq("id", templateId)
    .eq("business_id", businessId)
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui template")
  if (!data) throw new ApiError("NOT_FOUND", "Template tidak ditemukan")
  return data
}

/** Thumbnail otomatis dari preview builder (docs/15 §15.3). */
export async function uploadTemplateThumbnail(
  userId: string,
  businessId: string,
  templateId: string,
  file: {
    name?: string | null
    type?: string | null
    size?: number | null
    arrayBuffer(): Promise<ArrayBuffer>
  }
) {
  await requireMembership(userId, businessId, "template:write")
  const body = Buffer.from(await file.arrayBuffer())
  const check = validateFrameFile(file, body)
  if (!check.ok) {
    throw new ApiError("VALIDATION_ERROR", check.error, { thumbnail: [check.error] })
  }
  const key = `${businessId}/templates/${Date.now()}-thumb-${Math.random().toString(36).slice(2, 8)}.${check.ext}`
  const supabase = createServerClient()
  // Thumbnail lama → dibersihkan setelah update sukses (anti orphan).
  // PENTING: ambil `file_url` juga — pada template hasil upload, thumbnail_url
  // default = file_url (frame). Tanpa pengecualian ini, mengganti thumbnail
  // lewat builder akan MENGHAPUS frame (file_url) → frame 404 & hilang.
  const { data: existing } = await supabase
    .from("templates")
    .select("file_url, thumbnail_url")
    .eq("id", templateId)
    .eq("business_id", businessId)
    .maybeSingle()
  const row = existing as { file_url?: string | null; thumbnail_url?: string | null } | null
  const oldThumb = row?.thumbnail_url ?? null
  const currentFrame = row?.file_url ?? null

  const { error: uploadError } = await getStorage().upload(BUCKET, key, body, {
    contentType: file.type ?? "application/octet-stream",
    upsert: false,
  })
  if (uploadError) throw new ApiError("INTERNAL", "Gagal mengunggah thumbnail")
  await accountStorageAdd(businessId, BUCKET, key, body.length)

  const { error } = await supabase
    .from("templates")
    .update({ thumbnail_url: key })
    .eq("id", templateId)
    .eq("business_id", businessId)
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan thumbnail")

  // Hapus thumbnail lama HANYA bila tidak lagi direferensikan (bukan key
  // thumbnail baru, dan bukan frame yang masih dipakai).
  const stale = staleThumbnailKeys({
    oldThumbnail: oldThumb,
    newThumbnail: key,
    currentFrame,
  })
  if (stale.length > 0) {
    await removeResolved(BUCKET, stale)
    await accountStorageSub(businessId, stale)
  }
}

/** Replace frame after client-side chroma-key processing. PNG preserves transparency. */
export async function replaceTemplateFrame(
  userId: string,
  businessId: string,
  templateId: string,
  file: {
    name?: string | null
    type?: string | null
    size?: number | null
    arrayBuffer(): Promise<ArrayBuffer>
  }
) {
  await requireMembership(userId, businessId, "template:write")
  const body = Buffer.from(await file.arrayBuffer())
  const check = validateFrameFile(file, body)
  if (!check.ok || file.type !== "image/png") {
    throw new ApiError("VALIDATION_ERROR", "Hasil chroma key harus PNG", {
      chroma_file: ["Hasil chroma key harus PNG"],
    })
  }
  await assertStorageAvailable(businessId, body.length)
  const supabase = createServerClient()
  const { data: row } = await supabase
    .from("templates")
    .select("file_url, thumbnail_url")
    .eq("id", templateId)
    .eq("business_id", businessId)
    .maybeSingle()
  if (!row) throw new ApiError("NOT_FOUND", "Template tidak ditemukan")
  const key = `${businessId}/templates/${Date.now()}-chroma-${Math.random().toString(36).slice(2, 8)}.png`
  const { error: uploadError } = await getStorage().upload(BUCKET, key, body, {
    contentType: "image/png",
    upsert: false,
  })
  if (uploadError) throw new ApiError("INTERNAL", "Gagal mengunggah hasil chroma key")
  await accountStorageAdd(businessId, BUCKET, key, body.length)
  const { error } = await supabase
    .from("templates")
    .update({ file_url: key, thumbnail_url: key })
    .eq("id", templateId)
    .eq("business_id", businessId)
  if (error) {
    await removeResolved(BUCKET, [key])
    await accountStorageSub(businessId, [key])
    throw new ApiError("INTERNAL", "Gagal menyimpan frame chroma key")
  }
  // Bersihkan frame lama + thumbnail lama (keduanya kini unreferenced).
  const oldRows = row as { file_url: string; thumbnail_url?: string | null }
  const stale = staleTemplateKeys({
    oldFile: oldRows.file_url,
    oldThumbnail: oldRows.thumbnail_url,
    newKey: key,
  })
  if (stale.length > 0) {
    await removeResolved(BUCKET, stale)
    await accountStorageSub(businessId, stale)
  }
}

export async function deleteTemplate(userId: string, businessId: string, templateId: string) {
  await requireMembership(userId, businessId, "template:write")
  const supabase = createServerClient()
  const { data: row } = await supabase
    .from("templates")
    .select("id, file_url, thumbnail_url")
    .eq("id", templateId)
    .eq("business_id", businessId)
    .maybeSingle()
  if (!row) throw new ApiError("NOT_FOUND", "Template tidak ditemukan")

  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", templateId)
    .eq("business_id", businessId)
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus template")

  // Semua blob template: frame + thumbnail (thumbnail sering = frame,
  // dedup agar tak double-delete/double-sub).
  const r = row as { file_url: string; thumbnail_url?: string | null }
  const filesToRemove = staleTemplateKeys({
    oldFile: r.file_url,
    oldThumbnail: r.thumbnail_url,
  })
  await removeResolved(BUCKET, filesToRemove)
  await accountStorageSub(businessId, filesToRemove)
}
