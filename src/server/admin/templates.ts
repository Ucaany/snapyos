/**
 * Admin Templates & categories (global) — docs/10 §10.2 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import {
  adminGlobalTemplateCreateSchema,
  adminTemplateCategoryCreateSchema,
} from "@/lib/validators";
import { requireAdmin, audit } from "./guard";
import { validateFrameFile } from "@/server/templates";
import { LOGO_ALLOWED_TYPES } from "@/lib/upload-validation";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/constants";
import { getStorage, resolveStorage, removeResolved } from "@/server/storage";
import { staleTemplateKeys } from "@/lib/template-cleanup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminTemplateCategoryRow = {
  id: string;
  name: string;
  is_global: boolean;
  price: number | null;
};

export type AdminTemplateRow = {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  file_url: string;
  thumbnail_url: string | null;
  is_active: boolean;
  price: number | null;
  is_premium: boolean;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listTemplateCategories(): Promise<AdminTemplateCategoryRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("template_categories")
    .select("id, name, is_global, price")
    .order("name", { ascending: true });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat kategori");
  return (data ?? []) as AdminTemplateCategoryRow[];
}

export async function createTemplateCategory(input: { name: string; price?: number | null }) {
  const admin = await requireAdmin();
  const parsed = adminTemplateCategoryCreateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("template_categories")
    .insert({ name: parsed.name, is_global: true, price: parsed.price ?? null })
    .select("id, name, is_global, price")
    .single();
  if (error) {
    if (error.code === "23505") throw new ApiError("VALIDATION_ERROR", "Nama kategori sudah dipakai");
    throw new ApiError("INTERNAL", "Gagal membuat kategori");
  }
  await audit(admin.id, "admin.template_category.create", data.id, { name: parsed.name, price: parsed.price ?? null });
  return data as AdminTemplateCategoryRow;
}

export async function deleteTemplateCategory(categoryId: string) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("template_categories")
    .delete()
    .eq("id", categoryId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23503") {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Kategori masih dipakai template. Pindahkan atau hapus template terlebih dulu."
      );
    }
    throw new ApiError("INTERNAL", "Gagal menghapus kategori");
  }
  if (!data) throw new ApiError("NOT_FOUND", "Kategori tidak ditemukan");
  await audit(admin.id, "admin.template_category.delete", categoryId, {});
  return data;
}

export async function listGlobalTemplates(): Promise<AdminTemplateRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("templates")
    .select(
      "id, name, category, category_id, file_url, thumbnail_url, is_active, price, is_premium, created_at, template_categories(name)"
    )
    .is("business_id", null)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat template global");
  type Row = {
    id: string;
    name: string;
    category: string | null;
    category_id: string | null;
    file_url: string;
    thumbnail_url: string | null;
    is_active: boolean;
    price: number | null;
    is_premium: boolean;
    created_at: string;
    template_categories: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const cat = Array.isArray(r.template_categories)
      ? r.template_categories[0] ?? null
      : r.template_categories;
    return {
      id: r.id,
      name: r.name,
      category_id: r.category_id,
      category_name: cat?.name ?? r.category ?? null,
      file_url: r.file_url,
      thumbnail_url: r.thumbnail_url,
      is_active: r.is_active,
      price: r.price,
      is_premium: r.is_premium,
      created_at: r.created_at,
    };
  });
}

export async function createGlobalTemplate(input: {
  name: string;
  category_id: string;
  file_url: string;
  thumbnail_url?: string | null;
  is_active?: boolean;
  price?: number | null;
  is_premium?: boolean;
  layout?: unknown;
}) {
  const admin = await requireAdmin();
  const parsed = adminGlobalTemplateCreateSchema.parse(input);
  const supabase = createServerClient();
  const { data: cat, error: catErr } = await supabase
    .from("template_categories")
    .select("id, name")
    .eq("id", parsed.category_id)
    .maybeSingle();
  if (catErr) throw new ApiError("INTERNAL", "Gagal memvalidasi kategori");
  if (!cat) throw new ApiError("VALIDATION_ERROR", "Kategori tidak ditemukan");

  const { data, error } = await supabase
    .from("templates")
    .insert({
      business_id: null,
      name: parsed.name,
      category: cat.name,
      category_id: parsed.category_id,
      file_url: parsed.file_url,
      thumbnail_url: parsed.thumbnail_url ?? null,
      is_active: parsed.is_active ?? true,
      price: parsed.price ?? null,
      is_premium: parsed.is_premium ?? false,
      layout: parsed.layout ?? {},
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23503") {
      throw new ApiError("VALIDATION_ERROR", "Kategori tidak ditemukan");
    }
    throw new ApiError("INTERNAL", "Gagal membuat template global");
  }
  await audit(admin.id, "admin.template.create", data.id, {
    name: parsed.name,
    price: parsed.price ?? null,
    is_premium: parsed.is_premium ?? false,
  });
  return data;
}

/** Upload file frame global langsung dari browser admin (docs/10 §10.2).
 *  Mirip uploadTemplate owner: file PNG/JPG/WebP/SVG → storage bucket. */
export async function uploadGlobalTemplateFile(
  file: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
    arrayBuffer(): Promise<ArrayBuffer>;
  }
): Promise<{ key: string }> {
  await requireAdmin();
  const body = Buffer.from(await file.arrayBuffer());
  const check = validateFrameFile(file, body);
  if (!check.ok) {
    throw new ApiError("VALIDATION_ERROR", check.error, { file: [check.error] });
  }
  const ext = LOGO_ALLOWED_TYPES[(file.type ?? "").toLowerCase()];
  const key = `global/templates/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await getStorage().upload("business-assets", key, body, {
    contentType: file.type ?? "application/octet-stream",
    upsert: false,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal mengunggah frame global");
  return { key };
}

export async function updateGlobalTemplate(templateId: string, input: {
  name?: string;
  price?: number | null;
  is_premium?: boolean;
  is_active?: boolean;
}) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.price !== undefined) patch.price = input.price;
  if (input.is_premium !== undefined) patch.is_premium = input.is_premium;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (Object.keys(patch).length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Minimal satu field diubah");
  }
  const { data, error } = await supabase
    .from("templates")
    .update(patch)
    .eq("id", templateId)
    .is("business_id", null)
    .select("id, name, price, is_premium, is_active")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui template");
  if (!data) throw new ApiError("NOT_FOUND", "Template global tidak ditemukan");
  await audit(admin.id, "admin.template.update", templateId, { ...patch });
  return data;
}

export async function setGlobalTemplateActive(templateId: string, isActive: boolean) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("templates")
    .update({ is_active: isActive })
    .eq("id", templateId)
    .is("business_id", null)
    .select("id, is_active")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui template");
  if (!data) throw new ApiError("NOT_FOUND", "Template global tidak ditemukan");
  await audit(admin.id, "admin.template.update", templateId, { is_active: isActive });
  return data;
}

// ---------------------------------------------------------------------------
// Admin builder (slot frame) — docs/10 §10.2; mirror alur owner (docs/15).
// ---------------------------------------------------------------------------

export type AdminTemplateBuilderRow = {
  id: string;
  name: string;
  category: string;
  file_url: string;
  preview_url: string | null;
  layout: unknown;
  is_active: boolean;
};

export async function getGlobalTemplate(templateId: string): Promise<AdminTemplateBuilderRow> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, category, file_url, layout, is_active")
    .eq("id", templateId)
    .is("business_id", null)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat template global");
  if (!data) throw new ApiError("NOT_FOUND", "Template global tidak ditemukan");
  const row = data as {
    id: string; name: string; category: string; file_url: string; layout: unknown; is_active: boolean;
  };
  const provider = await resolveStorage("business-assets", row.file_url);
  const { data: signed } = await provider.createSignedUrl(
    "business-assets",
    row.file_url,
    SIGNED_URL_TTL_SECONDS
  );
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    file_url: row.file_url,
    preview_url: signed?.signedUrl ?? null,
    layout: row.layout,
    is_active: row.is_active,
  };
}

/** Simpan layout slot (builder admin) + thumbnail + frame chroma — mirror owner. */
export async function updateGlobalTemplateLayout(
  templateId: string,
  input: { layout: unknown; is_active: boolean }
) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const patch: Record<string, unknown> = {
    layout: input.layout ?? {},
    is_active: input.is_active,
  };
  const { data, error } = await supabase
    .from("templates")
    .update(patch)
    .eq("id", templateId)
    .is("business_id", null)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan layout template");
  if (!data) throw new ApiError("NOT_FOUND", "Template global tidak ditemukan");
  await audit(admin.id, "admin.template.update_layout", templateId, {});
  return data;
}

/** Thumbnail builder admin (preview PNG) — mirror owner uploadTemplateThumbnail. */
export async function uploadGlobalTemplateThumbnail(
  templateId: string,
  file: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
    arrayBuffer(): Promise<ArrayBuffer>;
  }
) {
  await requireAdmin();
  const body = Buffer.from(await file.arrayBuffer());
  const check = validateFrameFile(file, body);
  if (!check.ok) throw new ApiError("VALIDATION_ERROR", check.error, { thumbnail: [check.error] });
  const ext = LOGO_ALLOWED_TYPES[(file.type ?? "").toLowerCase()];
  const key = `global/templates/${Date.now()}-thumb-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const supabase = createServerClient();
  // Thumbnail lama → dibersihkan setelah update sukses (anti orphan).
  const { data: existing } = await supabase
    .from("templates")
    .select("thumbnail_url")
    .eq("id", templateId)
    .is("business_id", null)
    .maybeSingle();
  const oldThumb = (existing as { thumbnail_url?: string | null } | null)?.thumbnail_url ?? null;

  const { error } = await getStorage().upload("business-assets", key, body, {
    contentType: file.type ?? "application/octet-stream",
    upsert: false,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal mengunggah thumbnail");
  const { error: updErr } = await supabase
    .from("templates")
    .update({ thumbnail_url: key })
    .eq("id", templateId)
    .is("business_id", null);
  if (updErr) throw new ApiError("INTERNAL", "Gagal menyimpan thumbnail");

  if (oldThumb && oldThumb !== key) {
    await removeResolved("business-assets", [oldThumb]);
  }
}

/** Replace frame global (chroma-key PNG) — mirror owner replaceTemplateFrame. */
export async function replaceGlobalTemplateFrame(
  templateId: string,
  file: { name?: string | null; type?: string | null; size?: number | null; arrayBuffer(): Promise<ArrayBuffer> }
) {
  await requireAdmin();
  const body = Buffer.from(await file.arrayBuffer());
  const check = validateFrameFile(file, body);
  if (!check.ok || file.type !== "image/png") {
    throw new ApiError("VALIDATION_ERROR", "Hasil chroma key harus PNG", { chroma_file: ["Hasil chroma key harus PNG"] });
  }
  const supabase = createServerClient();
  const { data: row } = await supabase
    .from("templates")
    .select("file_url, thumbnail_url")
    .eq("id", templateId)
    .is("business_id", null)
    .maybeSingle();
  if (!row) throw new ApiError("NOT_FOUND", "Template global tidak ditemukan");
  const key = `global/templates/${Date.now()}-chroma-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await getStorage().upload("business-assets", key, body, {
    contentType: "image/png",
    upsert: false,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal mengunggah hasil chroma key");
  const { error: updErr } = await supabase
    .from("templates")
    .update({ file_url: key, thumbnail_url: key })
    .eq("id", templateId)
    .is("business_id", null);
  if (updErr) {
    await removeResolved("business-assets", [key]);
    throw new ApiError("INTERNAL", "Gagal menyimpan frame chroma key");
  }
  // Bersihkan frame lama + thumbnail lama (keduanya kini unreferenced).
  const oldRows = row as { file_url: string; thumbnail_url?: string | null };
  const stale = staleTemplateKeys({
    oldFile: oldRows.file_url,
    oldThumbnail: oldRows.thumbnail_url,
    newKey: key,
  });
  if (stale.length > 0) await removeResolved("business-assets", stale);
}

/**
 * Hapus template global (admin) + seluruh blob-nya (frame/thumbnail/video).
 * Baris DB dihapus dulu (cascade ke purchases), lalu storage cleanup agar
 * tidak ada object tertinggal. Idempotent: key yang sudah hilang = sukses.
 */
export async function deleteGlobalTemplate(templateId: string) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data: row } = await supabase
    .from("templates")
    .select("id, name, file_url, thumbnail_url")
    .eq("id", templateId)
    .is("business_id", null)
    .maybeSingle();
  if (!row) throw new ApiError("NOT_FOUND", "Template global tidak ditemukan");

  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", templateId)
    .is("business_id", null);
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus template global");

  const r = row as {
    file_url: string;
    thumbnail_url?: string | null;
  };
  const keys = staleTemplateKeys({
    oldFile: r.file_url,
    oldThumbnail: r.thumbnail_url,
  });
  if (keys.length > 0) await removeResolved("business-assets", keys);

  await audit(admin.id, "admin.template.delete", templateId, { name: (row as { name: string }).name });
  return { id: templateId };
}

export type AdminTemplatePurchaseRow = {
  id: string;
  business_id: string;
  business_name: string;
  template_id: string;
  template_name: string;
  price: number;
  created_at: string;
};

/** Riwayat pembelian template premium seluruh tenant (docs/15 §15.9b). */
export async function listTemplatePurchases(): Promise<AdminTemplatePurchaseRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("business_template_purchases")
    .select("id, business_id, template_id, price, created_at, businesses(name), templates(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new ApiError("INTERNAL", "Gagal memuat riwayat pembelian template");
  type Row = {
    id: string;
    business_id: string;
    template_id: string;
    price: number;
    created_at: string;
    businesses: { name: string } | { name: string }[] | null;
    templates: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    business_id: r.business_id,
    business_name: (Array.isArray(r.businesses) ? r.businesses[0] : r.businesses)?.name ?? "-",
    template_id: r.template_id,
    template_name: (Array.isArray(r.templates) ? r.templates[0] : r.templates)?.name ?? "-",
    price: r.price,
    created_at: r.created_at,
  }));
}
