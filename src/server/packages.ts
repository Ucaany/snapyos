/**
 * Package CRUD + m2m assign (templates/outlets/photoboxes) — docs/04 §4.9,
 * docs/08 §8.7. Harga integer IDR; package = dasar final amount (server-side).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import {
  packageCreateSchema,
  packageUpdateSchema,
  type PackageCreateInput,
  type PackageUpdateInput,
} from "@/lib/validators";
import { slotCount } from "@/lib/template-layout";

const COLUMNS = `id, name, price, photo_count, print_count, digital_output, capture_mode,
  description, is_active, created_at,
  package_templates ( template_id ), package_outlets ( outlet_id ), package_photoboxes ( photobox_id )`;

type CountJoin = { template_id?: string } | { outlet_id?: string } | { photobox_id?: string } | null;

export type PackageRow = {
  id: string;
  name: string;
  price: number;
  photo_count: number;
  print_count: number;
  digital_output: boolean;
  capture_mode: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  template_ids: string[];
  outlet_ids: string[];
  photobox_ids: string[];
  template_count: number;
  outlet_count: number;
  photobox_count: number;
};

function mapRow(row: {
  id: string; name: string; price: number; photo_count: number; print_count: number;
  digital_output: boolean; capture_mode: string; description: string | null;
  is_active: boolean; created_at: string;
  package_templates?: CountJoin[] | CountJoin;
  package_outlets?: CountJoin[] | CountJoin;
  package_photoboxes?: CountJoin[] | CountJoin;
}): PackageRow {
  const toArray = (
    j: CountJoin[] | CountJoin | undefined,
    key: "template_id" | "outlet_id" | "photobox_id"
  ): string[] => {
    if (!j) return [];
    const list = Array.isArray(j) ? j : [j];
    return list
      .map((r) => (r ? ((r as Record<string, unknown>)[key] as string | undefined) : undefined))
      .filter((v): v is string => Boolean(v));
  };
  const template_ids = toArray(row.package_templates, "template_id");
  const outlet_ids = toArray(row.package_outlets, "outlet_id");
  const photobox_ids = toArray(row.package_photoboxes, "photobox_id");
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    photo_count: row.photo_count,
    print_count: row.print_count,
    digital_output: row.digital_output,
    capture_mode: row.capture_mode,
    description: row.description,
    is_active: row.is_active,
    created_at: row.created_at,
    template_ids,
    outlet_ids,
    photobox_ids,
    template_count: template_ids.length,
    outlet_count: outlet_ids.length,
    photobox_count: photobox_ids.length,
  };
}

async function requireMembership(userId: string, businessId: string, permission: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, permission)) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin untuk aksi ini");
  }
  return membership;
}

async function assertIdsOwned(
  businessId: string,
  table: "templates" | "outlets" | "photoboxes",
  ids: string[]
) {
  if (ids.length === 0) return;
  const supabase = createServerClient();
  let req = supabase.from(table).select("id, business_id").eq("business_id", businessId);
  if (table === "templates") {
    // Template global platform (business_id null) boleh di-assign.
    req = supabase.from(table).select("id, business_id").or(`business_id.eq.${businessId},business_id.is.null`);
  }
  const { data } = await req.in("id", ids);
  const found = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError("VALIDATION_ERROR", `Ada ${table} yang bukan milik business ini`, {
      [`${table}_ids`]: ["Berisi id tidak valid"],
    });
  }
}

/**
 * Assign template → package DITOLAK kecuali slot_count == photo_count
 * (docs/15 §15.2). Template legacy (slot_count 0, layout kosong) tetap
 * boleh — backward compatible (docs/15 §15.9 AC 5).
 */
async function assertTemplatesMatchPhotoCount(
  businessId: string,
  templateIds: string[],
  photoCount: number
) {
  if (templateIds.length === 0) return;
  const supabase = createServerClient();
  const { data } = await supabase
    .from("templates")
    .select("id, name, layout")
    .or(`business_id.eq.${businessId},business_id.is.null`)
    .in("id", templateIds);
  const rows = (data ?? []) as { id: string; name: string; layout: unknown }[];
  const found = new Set(rows.map((r) => r.id));
  const missing = templateIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError("VALIDATION_ERROR", "Ada templates yang bukan milik business ini", {
      template_ids: ["Berisi id tidak valid"],
    });
  }
  const mismatched = rows
    .map((r) => ({ name: r.name, slots: slotCount(r.layout) }))
    .filter((r) => r.slots > 0 && r.slots !== photoCount);
  if (mismatched.length > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Jumlah slot template harus sama dengan jumlah foto package",
      {
        template_ids: mismatched.map((r) => `${r.name}: ${r.slots} slot ≠ ${photoCount} foto`),
      }
    );
  }
}

/** Sinkron m2m: replace penuh (hapus semua → insert baru). */
async function syncM2M(
  businessId: string,
  packageId: string,
  table: "package_templates" | "package_outlets" | "package_photoboxes",
  column: "template_id" | "outlet_id" | "photobox_id",
  ids: string[]
) {
  const supabase = createServerClient();
  const del = await supabase.from(table).delete().eq("package_id", packageId);
  if (del.error) throw new ApiError("INTERNAL", "Gagal sinkronisasi assignment");
  if (ids.length > 0) {
    const ins = await supabase
      .from(table)
      .insert(ids.map((id) => ({ package_id: packageId, [column]: id })));
    if (ins.error) throw new ApiError("INTERNAL", "Gagal sinkronisasi assignment");
  }
}

export async function listPackages(userId: string, businessId: string): Promise<PackageRow[]> {
  await requireMembership(userId, businessId, "package:read");
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("packages")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .order("price", { ascending: true });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat packages");
  return (data ?? []).map((row) => mapRow(row as Parameters<typeof mapRow>[0]));
}

export async function createPackage(
  userId: string,
  businessId: string,
  input: PackageCreateInput
) {
  const parsed = packageCreateSchema.parse(input);
  await requireMembership(userId, businessId, "package:write");
  await Promise.all([
    assertTemplatesMatchPhotoCount(businessId, parsed.template_ids, parsed.photo_count),
    assertIdsOwned(businessId, "outlets", parsed.outlet_ids),
    assertIdsOwned(businessId, "photoboxes", parsed.photobox_ids),
  ]);

  const supabase = createServerClient();
  const { template_ids, outlet_ids, photobox_ids, ...fields } = parsed;
  const { data, error } = await supabase
    .from("packages")
    .insert({ business_id: businessId, ...fields })
    .select("id, name, price")
    .single();
  if (error) throw new ApiError("INTERNAL", "Gagal membuat package");

  await Promise.all([
    syncM2M(businessId, data.id, "package_templates", "template_id", template_ids),
    syncM2M(businessId, data.id, "package_outlets", "outlet_id", outlet_ids),
    syncM2M(businessId, data.id, "package_photoboxes", "photobox_id", photobox_ids),
  ]);
  return data;
}

export async function updatePackage(
  userId: string,
  businessId: string,
  packageId: string,
  input: PackageUpdateInput
) {
  const parsed = packageUpdateSchema.parse(input);
  await requireMembership(userId, businessId, "package:write");

  const supabase = createServerClient();

  // Constraint slot_count (docs/15 §15.2): berlaku untuk template_ids baru
  // DAN untuk photo_count yang berubah saat template sudah ter-assign.
  const { data: existing } = await supabase
    .from("packages")
    .select("id, photo_count")
    .eq("id", packageId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!existing) throw new ApiError("NOT_FOUND", "Package tidak ditemukan");
  const finalPhotoCount = parsed.photo_count ?? existing.photo_count;
  if (parsed.template_ids) {
    await assertTemplatesMatchPhotoCount(businessId, parsed.template_ids, finalPhotoCount);
  } else if (parsed.photo_count !== undefined) {
    const { data: links } = await supabase
      .from("package_templates")
      .select("template_id")
      .eq("package_id", packageId);
    await assertTemplatesMatchPhotoCount(
      businessId,
      (links ?? []).map((l) => l.template_id),
      finalPhotoCount
    );
  }
  await assertIdsOwned(businessId, "outlets", parsed.outlet_ids ?? []);
  await assertIdsOwned(businessId, "photoboxes", parsed.photobox_ids ?? []);

  const { template_ids, outlet_ids, photobox_ids, ...fields } = parsed;
  const { data, error } = await supabase
    .from("packages")
    .update(fields)
    .eq("id", packageId)
    .eq("business_id", businessId)
    .select("id, name, price")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui package");
  if (!data) throw new ApiError("NOT_FOUND", "Package tidak ditemukan");

  if (template_ids) await syncM2M(businessId, packageId, "package_templates", "template_id", template_ids);
  if (outlet_ids) await syncM2M(businessId, packageId, "package_outlets", "outlet_id", outlet_ids);
  if (photobox_ids) await syncM2M(businessId, packageId, "package_photoboxes", "photobox_id", photobox_ids);
  return data;
}

export async function deletePackage(
  userId: string,
  businessId: string,
  packageId: string
) {
  await requireMembership(userId, businessId, "package:write");
  const supabase = createServerClient();

  // Guard: package yang sudah dipakai transaksi tidak boleh dihapus (FK restrict).
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("package_id", packageId);
  if ((count ?? 0) > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Package sudah dipakai transaksi — nonaktifkan saja (Switch active)."
    );
  }

  const { data, error } = await supabase
    .from("packages")
    .delete()
    .eq("id", packageId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus package");
  if (!data) throw new ApiError("NOT_FOUND", "Package tidak ditemukan");
}
