import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { insertAudit } from "@/server/audit";
import { requirePosAccess } from "@/server/pos-entitlement";
import {
  posProductCreateSchema,
  posProductUpdateSchema,
  type PosProductCreateInput,
  type PosProductUpdateInput,
} from "@/lib/validators";

/**
 * POS produk & booth — docs/pos/03 §3.
 * requirePosAccess (entitlement) di baris pertama SEMUA export (R4).
 * Katalog per business (A16); toggle POS per booth (A13).
 */

export type PosProductRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  description: string | null;
  price: number;
  cost: number | null;
  stock: number | null;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
};

export type PosBoothRow = {
  id: string;
  name: string;
  status: string;
  pos_enabled: boolean;
  outlet_id: string;
  outlet_name: string | null;
};

export type PosProductListInput = {
  search?: string;
  category?: string;
  activeOnly?: boolean;
};

type JoinName = { name: string } | { name: string }[] | null;

function mapProduct(row: unknown): PosProductRow {
  const r = row as {
    id: string;
    name: string;
    sku: string | null;
    category: string;
    description: string | null;
    price: number;
    cost: number | null;
    stock: number | null;
    is_active: boolean;
    image_url: string | null;
    created_at: string;
  };
  return {
    id: r.id,
    name: r.name,
    sku: r.sku,
    category: r.category,
    description: r.description,
    price: r.price,
    cost: r.cost,
    stock: r.stock,
    is_active: r.is_active,
    image_url: r.image_url,
    created_at: r.created_at,
  };
}

const PRODUCT_COLUMNS = `id, name, sku, category, description, price, cost, stock, is_active, image_url, created_at`;

export async function listPosProducts(
  userId: string,
  businessId: string,
  query: PosProductListInput = {}
): Promise<PosProductRow[]> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:read")) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }

  const supabase = createServerClient();
  let req = supabase
    .from("pos_products")
    .select(PRODUCT_COLUMNS)
    .eq("business_id", businessId)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (query.activeOnly) req = req.eq("is_active", true);
  if (query.category) req = req.eq("category", query.category);
  if (query.search) {
    const like = `%${query.search.replace(/[%_]/g, (m) => "\\" + m)}%`;
    req = req.or(`name.ilike.${like},sku.ilike.${like}`);
  }

  const { data, error } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat produk POS");
  return (data ?? []).map(mapProduct);
}

export async function createPosProduct(
  userId: string,
  businessId: string,
  input: PosProductCreateInput
): Promise<PosProductRow> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:manage")) {
    throw new ApiError("FORBIDDEN", "Hanya owner/manager yang dapat mengelola produk POS");
  }
  const parsed = posProductCreateSchema.parse(input);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pos_products")
    .insert({
      business_id: businessId,
      name: parsed.name,
      sku: parsed.sku || null,
      category: parsed.category,
      description: parsed.description || null,
      price: parsed.price,
      cost: parsed.cost ?? null,
      stock: parsed.stock ?? null,
      image_url: parsed.image_url || null,
    })
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError("VALIDATION_ERROR", "SKU sudah dipakai di business ini", {
        sku: ["SKU sudah dipakai"],
      });
    }
    throw new ApiError("INTERNAL", "Gagal membuat produk POS");
  }

  await insertAudit({
    actorId: userId,
    businessId,
    action: "pos.product.create",
    target: data.id,
    meta: { name: parsed.name, price: parsed.price },
  });
  return mapProduct(data);
}

export async function updatePosProduct(
  userId: string,
  businessId: string,
  input: PosProductUpdateInput
): Promise<PosProductRow> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:manage")) {
    throw new ApiError("FORBIDDEN", "Hanya owner/manager yang dapat mengelola produk POS");
  }
  const parsed = posProductUpdateSchema.parse(input);
  const { id, ...fields } = parsed;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pos_products")
    .update({
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.sku !== undefined ? { sku: fields.sku || null } : {}),
      ...(fields.category !== undefined ? { category: fields.category } : {}),
      ...(fields.description !== undefined ? { description: fields.description || null } : {}),
      ...(fields.price !== undefined ? { price: fields.price } : {}),
      ...(fields.cost !== undefined ? { cost: fields.cost ?? null } : {}),
      ...(fields.stock !== undefined ? { stock: fields.stock ?? null } : {}),
      ...(fields.image_url !== undefined ? { image_url: fields.image_url || null } : {}),
    })
    .eq("id", id)
    .eq("business_id", businessId) // cross-tenant = 0 rows = 404
    .select(PRODUCT_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError("VALIDATION_ERROR", "SKU sudah dipakai di business ini", {
        sku: ["SKU sudah dipakai"],
      });
    }
    throw new ApiError("INTERNAL", "Gagal memperbarui produk POS");
  }
  if (!data) throw new ApiError("NOT_FOUND", "Produk tidak ditemukan");

  await insertAudit({
    actorId: userId,
    businessId,
    action: "pos.product.update",
    target: id,
    meta: { fields: Object.keys(fields) },
  });
  return mapProduct(data);
}

/** Soft delete — riwayat order (snapshot) tetap utuh. */
export async function deactivatePosProduct(
  userId: string,
  businessId: string,
  productId: string
): Promise<void> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:manage")) {
    throw new ApiError("FORBIDDEN", "Hanya owner/manager yang dapat mengelola produk POS");
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pos_products")
    .update({ is_active: false })
    .eq("id", productId)
    .eq("business_id", businessId)
    .select("id, name")
    .maybeSingle();

  if (error) throw new ApiError("INTERNAL", "Gagal menonaktifkan produk POS");
  if (!data) throw new ApiError("NOT_FOUND", "Produk tidak ditemukan");

  await insertAudit({
    actorId: userId,
    businessId,
    action: "pos.product.deactivate",
    target: productId,
    meta: { name: data.name },
  });
}

export async function listPosCategories(userId: string, businessId: string): Promise<string[]> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:read")) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pos_products")
    .select("category")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("category");
  if (error) throw new ApiError("INTERNAL", "Gagal memuat kategori POS");
  return [...new Set((data ?? []).map((r) => (r as { category: string }).category))];
}

export async function listPosBooths(userId: string, businessId: string): Promise<PosBoothRow[]> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:read")) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("photoboxes")
    .select(`id, name, status, pos_enabled, outlet_id, outlets ( name )`)
    .eq("business_id", businessId)
    .order("name");
  if (error) throw new ApiError("INTERNAL", "Gagal memuat booth POS");

  return (data ?? []).flatMap((row) => {
    const r = row as {
      id: string;
      name: string;
      status: string;
      pos_enabled: boolean;
      outlet_id: string;
      outlets?: JoinName;
    };
    const outlet = r.outlets && !Array.isArray(r.outlets) ? r.outlets : null;
    return [
      {
        id: r.id,
        name: r.name,
        status: r.status,
        pos_enabled: r.pos_enabled,
        outlet_id: r.outlet_id,
        outlet_name: outlet?.name ?? null,
      },
    ];
  });
}

/**
 * Toggle POS per booth (A13) — menyembunyikan booth di UI bukan pengaman; server yang validasi.
 * 1 add-on = 1 booth aktif: saat mengaktifkan booth, booth lain yang pos_enabled dinonaktifkan
 * dulu (single active booth per business).
 */
export async function setPosBoothEnabled(
  userId: string,
  businessId: string,
  photoboxId: string,
  enabled: boolean
): Promise<void> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:manage")) {
    throw new ApiError("FORBIDDEN", "Hanya owner/manager yang dapat mengatur booth POS");
  }

  const supabase = createServerClient();

  // Konfirmasi booth target milik tenant (cross-tenant = 404) sebelum mutasi.
  const { data: target } = await supabase
    .from("photoboxes")
    .select("id, name")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!target) throw new ApiError("NOT_FOUND", "Booth tidak ditemukan");

  if (enabled) {
    // 1 booth aktif saja: nonaktifkan semua booth lain milik tenant.
    const { error: clearError } = await supabase
      .from("photoboxes")
      .update({ pos_enabled: false })
      .eq("business_id", businessId)
      .neq("id", photoboxId)
      .eq("pos_enabled", true);
    if (clearError) throw new ApiError("INTERNAL", "Gagal mengatur booth POS");
  }

  const { error } = await supabase
    .from("photoboxes")
    .update({ pos_enabled: enabled })
    .eq("id", photoboxId)
    .eq("business_id", businessId); // cross-tenant = 0 rows = 404
  if (error) {
    // 23505 = partial unique index (0056): booth lain sudah aktif lebih dulu.
    if (error.code === "23505") {
      throw new ApiError(
        "POS_BOOTH_ALREADY_ACTIVE",
        "Booth POS lain sudah aktif. Nonaktifkan dulu untuk memindahkan POS ke booth ini."
      );
    }
    throw new ApiError("INTERNAL", "Gagal mengatur booth POS");
  }

  await insertAudit({
    actorId: userId,
    businessId,
    action: "pos.booth.toggle",
    target: photoboxId,
    meta: { name: target.name, enabled },
  });
}
