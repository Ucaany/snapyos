/**
 * Template CRUD + upload frame — docs/04 §4.10, docs/08 §8.7.
 * File di bucket private business-assets; preview via signed URL (docs/09).
 * MVP = upload frame sendiri (PNG/JPG/WebP transparan) + kelola + assign (§4.10.1).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can, type Permission } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { LOGO_ALLOWED_TYPES, sniffImageType } from "@/lib/upload-validation";
import {
  templateCreateSchema,
  templateUpdateSchema,
  type TemplateCreateInput,
  type TemplateUpdateInput,
} from "@/lib/validators";
import { layoutSchema, slotCount, type TemplateLayout } from "@/lib/template-layout";
import { planLimitError } from "@/lib/plan-limits";
import { staleTemplateKeys } from "@/lib/template-cleanup";
import { generateFrameThumbnail } from "@/server/frame-thumbnail";
import { SIGNED_URL_TTL_SECONDS as SIGNED_URL_TTL } from "@/lib/constants";
import {
  assertStorageAvailable,
  accountStorageAdd,
  accountStorageSub,
} from "@/server/storage-usage";
import { getStorage, resolveStorage, signedUrlMap, removeResolved } from "@/server/storage";
import { requirePlanLimits } from "@/server/plan-limits";
import { invalidatePublicConfig } from "@/server/public-config";
import { insertAudit } from "@/server/audit";

const BUCKET = "business-assets";
const TEMPLATE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB (docs/04 §4.10)

const COLUMNS =
  "id, business_id, name, category, file_url, thumbnail_url, layout, is_active, created_at";
const GLOBAL_COLUMNS = `${COLUMNS}, is_premium, price`;

export type TemplateRow = {
  id: string;
  name: string;
  category: string;
  file_url: string;
  is_active: boolean;
  created_at: string;
  preview_url: string | null;
  /** layout jsonb mentah — null/{} = template legacy (docs/15 §15.2). */
  layout: TemplateLayout | Record<string, never> | null;
  slot_count: number;
  /** Di-assign ke minimal satu paket? Template aktif tanpa assignment tidak
   *  pernah sampai ke kiosk. Opsional: builder/admin membangun row manual. */
  assigned?: boolean;
  /** Paket yang memakai template ini (informasi assignment di dashboard). */
  assigned_packages?: { id: string; name: string; photo_count: number }[];
  /** true = template global platform (business_id NULL) — read-only untuk owner. */
  is_global: boolean;
  /** Signed URL thumbnail (fallback: null). Grid memakai ini dulu. */
  thumbnail_preview_url: string | null;
};

async function requireMembership(userId: string, businessId: string, permission: Permission) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, permission)) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin untuk aksi ini");
  }
  return membership;
}

export function validateFrameFile(
  file: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
  },
  bytes?: Uint8Array | null
): { ok: true; ext: string } | { ok: false; error: string } {
  const type = (file.type ?? "").toLowerCase();
  if (!file.name) return { ok: false, error: "File tidak terbaca" };
  if (!LOGO_ALLOWED_TYPES[type]) {
    return { ok: false, error: "Frame harus PNG, JPG, atau WebP" };
  }
  if ((file.size ?? 0) <= 0) return { ok: false, error: "File kosong" };
  if ((file.size ?? 0) > TEMPLATE_MAX_BYTES) {
    return { ok: false, error: "Ukuran frame maksimal 5 MB" };
  }
  if (bytes && sniffImageType(bytes) !== type) {
    return { ok: false, error: "Konten file tidak cocok dengan tipe yang diklaim" };
  }
  return { ok: true, ext: LOGO_ALLOWED_TYPES[type] };
}

type TemplateDbRow = {
  id: string;
  business_id: string | null;
  name: string;
  category: string;
  file_url: string;
  thumbnail_url: string | null;
  layout: unknown;
  is_active: boolean;
  created_at: string;
  is_premium?: boolean | null;
  price?: number | null;
};

/** URL absolut (CDN) diteruskan apa adanya; key storage di-sign. */
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

async function toTemplateRow(row: TemplateDbRow): Promise<TemplateRow> {
  let previewUrl: string | null = null;
  if (isHttpUrl(row.file_url)) {
    previewUrl = row.file_url;
  } else {
    const provider = await resolveStorage(BUCKET, row.file_url);
    const { data } = await provider.createSignedUrl(BUCKET, row.file_url, SIGNED_URL_TTL);
    previewUrl = data?.signedUrl ?? null;
  }
  const thumbnailUrl = row.thumbnail_url
    ? isHttpUrl(row.thumbnail_url)
      ? row.thumbnail_url
      : ((await signedUrlMap(BUCKET, [row.thumbnail_url], SIGNED_URL_TTL)).get(row.thumbnail_url) ??
        null)
    : null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    file_url: row.file_url,
    is_active: row.is_active,
    created_at: row.created_at,
    preview_url: previewUrl,
    layout: (row.layout ?? {}) as TemplateRow["layout"],
    slot_count: slotCount(row.layout),
    is_global: row.business_id === null,
    thumbnail_preview_url: thumbnailUrl,
  };
}

export async function listTemplates(
  userId: string,
  businessId: string,
  options: { includeInactive?: boolean } = {}
): Promise<TemplateRow[]> {
  await requireMembership(userId, businessId, "template:read");
  const supabase = createServerClient();
  let req = supabase
    .from("templates")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (!options.includeInactive) req = req.eq("is_active", true);

  const { data, error } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat templates");

  const rows = (data ?? []) as TemplateDbRow[];

  // Template global yang bisa dipakai business ini ikut tampil (docs/15 §15.9b):
  // 1) global gratis & aktif, 2) global yang sudah dibeli (apa pun statusnya —
  // owner harus melihat yang sudah dibayar; UI menyembunyikan edit dan server
  // menolak assignment saat nonaktif).
  const { data: owned } = await supabase
    .from("business_template_purchases")
    .select("template_id")
    .eq("business_id", businessId);
  const ownedIds = ((owned ?? []) as { template_id: string }[]).map((o) => o.template_id);

  const globalRows: TemplateDbRow[] = [];
  const { data: freeGlobals } = await supabase
    .from("templates")
    .select(GLOBAL_COLUMNS)
    .is("business_id", null)
    .eq("is_active", true);
  for (const row of (freeGlobals ?? []) as TemplateDbRow[]) {
    const free =
      row.is_premium === false || row.price === null || row.price === undefined || row.price === 0;
    if (free) globalRows.push(row);
  }
  if (ownedIds.length > 0) {
    let purchasedReq = supabase
      .from("templates")
      .select(GLOBAL_COLUMNS)
      .is("business_id", null)
      .in("id", ownedIds);
    // Staff (includeInactive=false) tidak boleh melihat template nonaktif,
    // bahkan yang sudah dibeli. Owner dengan includeInactive melihat semuanya.
    if (!options.includeInactive) purchasedReq = purchasedReq.eq("is_active", true);
    const { data: purchased } = await purchasedReq;
    globalRows.push(...((purchased ?? []) as TemplateDbRow[]));
  }

  const seen = new Set(rows.map((r) => r.id));
  const globalIds = new Set<string>();
  for (const row of globalRows) {
    globalIds.add(row.id);
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }

  // Batch signed URLs — frame + thumbnail, satu panggilan storage.
  const keys = Array.from(
    new Set(
      rows.flatMap((r) => {
        const ks = [r.file_url];
        if (r.thumbnail_url) ks.push(r.thumbnail_url);
        return ks;
      })
    )
  );
  const urlByKey = await signedUrlMap(BUCKET, keys, SIGNED_URL_TTL);

  // Template aktif yang belum di-assign ke paket mana pun tidak akan pernah
  // muncul di kiosk (docs/05 §5.4) — owner melihat sebabnya langsung di kartu,
  // bukan menebak kenapa frame "sudah aktif" tetap tidak ada di booth.
  const linkedIds = new Set<string>();
  const packagesByTemplate = new Map<string, { id: string; name: string; photo_count: number }[]>();
  if (rows.length > 0) {
    const { data: linked } = await supabase
      .from("package_templates")
      .select("template_id, package_id")
      .in(
        "template_id",
        rows.map((r) => r.id)
      );
    const links = (linked ?? []) as { template_id: string; package_id: string }[];
    for (const l of links) linkedIds.add(l.template_id);

    // Nama + jumlah foto paket: satu query untuk seluruh link (bukan N+1).
    const packageIds = Array.from(new Set(links.map((l) => l.package_id)));
    if (packageIds.length > 0) {
      const { data: pkgs } = await supabase
        .from("packages")
        .select("id, name, photo_count")
        .eq("business_id", businessId)
        .in("id", packageIds);
      const byId = new Map(
        ((pkgs ?? []) as { id: string; name: string; photo_count: number }[]).map((p) => [p.id, p])
      );
      for (const l of links) {
        const pkg = byId.get(l.package_id);
        if (!pkg) continue;
        const list = packagesByTemplate.get(l.template_id) ?? [];
        list.push({ id: pkg.id, name: pkg.name, photo_count: pkg.photo_count });
        packagesByTemplate.set(l.template_id, list);
      }
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    file_url: row.file_url,
    is_active: row.is_active,
    created_at: row.created_at,
    preview_url: urlByKey.get(row.file_url) ?? (isHttpUrl(row.file_url) ? row.file_url : null),
    layout: (row.layout ?? {}) as TemplateRow["layout"],
    slot_count: slotCount(row.layout),
    assigned: linkedIds.has(row.id),
    assigned_packages: packagesByTemplate.get(row.id) ?? [],
    is_global: globalIds.has(row.id),
    thumbnail_preview_url: row.thumbnail_url
      ? (urlByKey.get(row.thumbnail_url) ??
        (isHttpUrl(row.thumbnail_url) ? row.thumbnail_url : null))
      : null,
  }));
}

/** Satu template untuk builder — docs/15 §15.3. Owner sendiri atau global
 *  yang boleh dipakai (dibeli, atau aktif & gratis). */
export async function getTemplateForBuilder(
  userId: string,
  businessId: string,
  templateId: string
): Promise<{ template: TemplateRow; is_global: boolean }> {
  await requireMembership(userId, businessId, "template:read");
  const supabase = createServerClient();
  const { data: owned, error: ownedError } = await supabase
    .from("templates")
    .select(COLUMNS)
    .eq("id", templateId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (ownedError) throw new ApiError("INTERNAL", "Gagal memuat template");
  if (owned) return { template: await toTemplateRow(owned as TemplateDbRow), is_global: false };

  const { data: globalRow, error: globalError } = await supabase
    .from("templates")
    .select(GLOBAL_COLUMNS)
    .eq("id", templateId)
    .is("business_id", null)
    .maybeSingle();
  if (globalError) throw new ApiError("INTERNAL", "Gagal memuat template");
  if (!globalRow) throw new ApiError("NOT_FOUND", "Template tidak ditemukan");
  const row = globalRow as TemplateDbRow;

  const { data: purchase } = await supabase
    .from("business_template_purchases")
    .select("template_id")
    .eq("business_id", businessId)
    .eq("template_id", templateId)
    .maybeSingle();
  const purchased = Boolean(purchase);
  const free =
    row.is_premium === false || row.price === null || row.price === undefined || row.price === 0;
  if (!purchased && !(row.is_active && free)) {
    throw new ApiError("NOT_FOUND", "Template tidak ditemukan");
  }
  return { template: await toTemplateRow(row), is_global: true };
}

export async function uploadTemplate(
  userId: string,
  businessId: string,
  file: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
    arrayBuffer(): Promise<ArrayBuffer>;
  },
  meta: { name: string; category: TemplateCreateInput["category"]; is_active?: boolean }
) {
  await requireMembership(userId, businessId, "template:write");
  const body = Buffer.from(await file.arrayBuffer());
  const check = validateFrameFile(file, body);
  if (!check.ok) {
    throw new ApiError("VALIDATION_ERROR", check.error, { file: [check.error] });
  }

  const supabase = createServerClient();
  const [limits, { count }] = await Promise.all([
    requirePlanLimits(businessId),
    supabase
      .from("templates")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
  ]);
  if (planLimitError(count ?? 0, limits.max_templates)) {
    throw new ApiError(
      "PLAN_LIMIT_REACHED",
      `Plan Anda dibatasi ${limits.max_templates} template. Upgrade untuk menambah.`
    );
  }

  await assertStorageAvailable(businessId, body.length);
  const parsed = templateCreateSchema.parse({
    name: meta.name,
    category: meta.category,
    file_url: "pending",
  });

  const baseName = `${businessId}/templates/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const key = `${baseName}.${check.ext}`;
  const { error: uploadError } = await getStorage().upload(BUCKET, key, body, {
    contentType: file.type ?? "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw new ApiError("INTERNAL", "Gagal mengunggah frame");
  await accountStorageAdd(businessId, BUCKET, key, body.length);

  // Thumbnail WebP terpisah: grid pilih frame tidak perlu mengunduh PNG penuh.
  const thumbKey = await uploadGeneratedThumbnail(businessId, baseName, body);

  const { data, error } = await supabase
    .from("templates")
    .insert({
      business_id: businessId,
      name: parsed.name,
      category: parsed.category,
      file_url: key,
      thumbnail_url: thumbKey ?? key,
      is_active: meta.is_active ?? true,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan template");
  invalidatePublicConfig(businessId);
  return data;
}

/**
 * Buat + unggah thumbnail WebP. Return key bila berhasil, null bila decode
 * gagal (pemanggil memakai frame penuh sebagai fallback). Upload thumbnail
 * yang gagal tidak boleh menggagalkan upload frame: best-effort + log.
 */
async function uploadGeneratedThumbnail(
  businessId: string,
  baseName: string,
  frameBytes: Buffer
): Promise<string | null> {
  const thumb = await generateFrameThumbnail(frameBytes);
  if (!thumb) return null;
  const thumbKey = `${baseName}-thumb.${thumb.extension}`;
  const { error } = await getStorage().upload(BUCKET, thumbKey, thumb.bytes, {
    contentType: thumb.contentType,
    upsert: false,
  });
  if (error) {
    console.error("[templates] gagal mengunggah thumbnail:", error.message);
    return null;
  }
  await accountStorageAdd(businessId, BUCKET, thumbKey, thumb.bytes.length);
  return thumbKey;
}

export async function updateTemplate(
  userId: string,
  businessId: string,
  templateId: string,
  input: TemplateUpdateInput
) {
  const parsed = templateUpdateSchema.parse(input);
  await requireMembership(userId, businessId, "template:write");
  const supabase = createServerClient();
  // Kolom NOT NULL — layout null (kembali ke legacy) disimpan sebagai '{}';
  // layout undefined (tidak dikirim) tidak menyentuh kolom.
  const patch = parsed.layout === undefined ? parsed : { ...parsed, layout: parsed.layout ?? {} };
  const { data, error } = await supabase
    .from("templates")
    .update(patch)
    .eq("id", templateId)
    .eq("business_id", businessId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui template");
  if (!data) throw new ApiError("NOT_FOUND", "Template tidak ditemukan");
  invalidatePublicConfig(businessId);
  return data;
}

export async function deleteTemplate(userId: string, businessId: string, templateId: string) {
  await requireMembership(userId, businessId, "template:write");
  const supabase = createServerClient();
  const { data: row } = await supabase
    .from("templates")
    .select("id, file_url, thumbnail_url")
    .eq("id", templateId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!row) throw new ApiError("NOT_FOUND", "Template tidak ditemukan");

  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", templateId)
    .eq("business_id", businessId);
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus template");
  invalidatePublicConfig(businessId);

  // Semua blob template: frame + thumbnail (thumbnail sering = frame,
  // dedup agar tak double-delete/double-sub).
  const r = row as { file_url: string; thumbnail_url?: string | null };
  const filesToRemove = staleTemplateKeys({
    oldFile: r.file_url,
    oldThumbnail: r.thumbnail_url,
  });
  await removeResolved(BUCKET, filesToRemove);
  await accountStorageSub(businessId, filesToRemove);
}

/** Simpan layout builder owner (draft/publish). Hanya template milik business —
 *  template global read-only dari sisi owner (docs/15 §15.3). */ export async function saveTemplateLayout(
  userId: string,
  businessId: string,
  templateId: string,
  layout: unknown,
  isActive: boolean
): Promise<{ id: string }> {
  await requireMembership(userId, businessId, "template:write");
  const parsed = layoutSchema.safeParse(layout);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "layout";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ApiError("VALIDATION_ERROR", "Layout tidak valid", fieldErrors);
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("templates")
    .update({ layout: parsed.data, is_active: isActive })
    .eq("id", templateId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan layout template");
  if (!data) throw new ApiError("NOT_FOUND", "Template tidak ditemukan");
  await insertAudit({
    actorId: userId,
    businessId,
    action: "template.layout.save",
    target: templateId,
    meta: { slots: parsed.data.slots.length, is_active: isActive },
  });
  invalidatePublicConfig(businessId);
  return { id: templateId };
}

/**
 * Duplikat template menjadi template BARU milik business ini — frame (bytes)
 * disalin lewat storage, layout/draft ikut. Dipakai builder: owner menduplikasi
 * template platform read-only (atau template sendiri) lalu mengedit salinannya
 * tanpa menyentuh aslinya. Template tujuan selalu nonaktif (draft) supaya
 * kiosk tidak tiba-tiba menampilkan frame duplikat.
 */
export async function duplicateTemplate(
  userId: string,
  businessId: string,
  templateId: string
): Promise<{ id: string }> {
  await requireMembership(userId, businessId, "template:write");

  const supabase = createServerClient();
  const { data: own, error: ownError } = await supabase
    .from("templates")
    .select("id, name, category, file_url, thumbnail_url, layout, business_id")
    .eq("id", templateId)
    .maybeSingle();
  if (ownError) throw new ApiError("INTERNAL", "Gagal memuat template");
  const source = own as TemplateDbRow | null;
  if (!source) throw new ApiError("NOT_FOUND", "Template tidak ditemukan");
  // Template business lain tidak pernah boleh disalin.
  if (source.business_id !== null && source.business_id !== businessId) {
    throw new ApiError("NOT_FOUND", "Template tidak ditemukan");
  }

  const [limits, { count }] = await Promise.all([
    requirePlanLimits(businessId),
    supabase
      .from("templates")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
  ]);
  if (planLimitError(count ?? 0, limits.max_templates)) {
    throw new ApiError(
      "PLAN_LIMIT_REACHED",
      `Plan Anda dibatasi ${limits.max_templates} template. Upgrade untuk menambah.`
    );
  }

  // Frame disalin byte-per-byte: URL eksternal tidak bisa dipindah ke storage
  // kita, jadi hanya key storage yang diduplikasi (URL disimpan apa adanya).
  let newFileKey = source.file_url;
  if (!isHttpUrl(source.file_url)) {
    const provider = await resolveStorage(BUCKET, source.file_url);
    const { data: signed, error: signError } = await provider.createSignedUrl(
      BUCKET,
      source.file_url,
      SIGNED_URL_TTL
    );
    if (signError || !signed?.signedUrl) {
      throw new ApiError("INTERNAL", "Gagal membaca frame sumber");
    }
    const response = await fetch(signed.signedUrl, { cache: "no-store" });
    if (!response.ok) throw new ApiError("INTERNAL", "Gagal mengunduh frame sumber");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > TEMPLATE_MAX_BYTES) {
      throw new ApiError("VALIDATION_ERROR", "Frame sumber melebihi 5 MB");
    }
    await assertStorageAvailable(businessId, bytes.length);

    const ext = source.file_url.split(".").pop()?.toLowerCase() ?? "png";
    const baseName = `${businessId}/templates/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    newFileKey = `${baseName}.${ext}`;
    const { error: uploadError } = await getStorage().upload(BUCKET, newFileKey, bytes, {
      contentType:
        ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext === "webp" ? "webp" : "png"}`,
      upsert: false,
    });
    if (uploadError) throw new ApiError("INTERNAL", "Gagal menyalin frame");
    await accountStorageAdd(businessId, BUCKET, newFileKey, bytes.length);
  }

  const { data, error } = await supabase
    .from("templates")
    .insert({
      business_id: businessId,
      name: `${source.name} (salinan)`.slice(0, 120),
      category: source.category,
      file_url: newFileKey,
      // Thumbnail tidak disalin: frame penuh aman sebagai sumber thumbnail
      // (proxy frame membuat versi 480px), dan key lama bisa dimiliki tenant lain.
      thumbnail_url: newFileKey,
      layout: source.layout ?? {},
      is_active: false,
    })
    .select("id")
    .single();
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan salinan template");

  await insertAudit({
    actorId: userId,
    businessId,
    action: "template.duplicate",
    target: templateId,
    meta: { copy_id: (data as { id: string }).id },
  });
  invalidatePublicConfig(businessId);
  return { id: (data as { id: string }).id };
}
