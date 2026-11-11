/**
 * Package CRUD + m2m assign (templates/outlets/photoboxes) — docs/04 §4.9,
 * docs/08 §8.7. Harga integer IDR; package = dasar final amount (server-side).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { planLimitError } from "@/lib/plan-limits";
import { invalidTemplateIds, type AssignableTemplateRow } from "@/lib/template-assignment";
import { can, type Permission } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { invalidatePublicConfig } from "@/server/public-config";
import { requirePlanLimits } from "@/server/plan-limits";
import {
  packageCreateSchema,
  packageUpdateSchema,
  type PackageCreateInput,
  type PackageUpdateInput,
} from "@/lib/validators";

const COLUMNS = `id, name, price, photo_count, print_count, digital_output, capture_mode,
  description, is_active, created_at,
  package_templates ( template_id ), package_outlets ( outlet_id ), package_photoboxes ( photobox_id )`;

type CountJoin =
  { template_id?: string } | { outlet_id?: string } | { photobox_id?: string } | null;

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

async function requireMembership(userId: string, businessId: string, permission: Permission) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, permission)) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin untuk aksi ini");
  }
  return membership;
}

async function assertIdsOwned(businessId: string, table: "outlets" | "photoboxes", ids: string[]) {
  if (ids.length === 0) return;
  const supabase = createServerClient();
  const { data } = await supabase
    .from(table)
    .select("id, business_id")
    .eq("business_id", businessId)
    .in("id", ids);
  const found = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError("VALIDATION_ERROR", `Ada ${table} yang bukan milik business ini`, {
      [`${table}_ids`]: ["Berisi id tidak valid"],
    });
  }
}

/**
 * Template assignable (docs/15 §15.9b): milik sendiri ATAU global yang aktif
 * dan (gratis atau sudah dibeli). Query hanya mengambil kandidat yang mungkin
 * valid; keputusan akhir memakai `invalidTemplateIds` (aturan murni bersama).
 */
async function assertTemplatesAssignable(businessId: string, ids: string[]) {
  if (ids.length === 0) return;
  const supabase = createServerClient();
  const [{ data: rows }, { data: purchases }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, business_id, is_active, is_premium, price")
      .or(`business_id.eq.${businessId},business_id.is.null`)
      .in("id", ids),
    supabase
      .from("business_template_purchases")
      .select("template_id")
      .eq("business_id", businessId),
  ]);
  const purchased = new Set(
    ((purchases ?? []) as { template_id: string }[]).map((row) => row.template_id)
  );
  const invalid = invalidTemplateIds(
    (rows ?? []) as AssignableTemplateRow[],
    businessId,
    purchased,
    ids
  );
  if (invalid.length > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Ada template yang tidak bisa dipakai (nonaktif/belum dibeli)",
      { template_ids: ["Berisi template yang tidak tersedia untuk business ini"] }
    );
  }
}

/**
 * Template boleh di-assign lintas paket berapa pun jumlah slotnya. Aturan
 * "slot_count == photo_count" dihapus 2026-10-19: slot frame menentukan
 * jumlah capture runtime, sedangkan `packages.photo_count` menjadi fallback
 * untuk template legacy tanpa slot. Slot yang perlu mengulang foto diisi
 * bergiliran (`src/lib/template-fit.ts`).
 */

/**
 * Sinkron m2m: selisihkan (diff) terhadap isi yang ada: insert dulu, baru
 * hapus yang tidak lagi dipakai. Urutan "delete semua → insert" sebelumnya
 * non-transaksional: bila insert gagal, package ditinggal TANPA assignment
 * sama sekali (eligibility kiosk hilang diam-diam). Dengan diff, kegagalan
 * insert tidak pernah mengosongkan himpunan yang sudah benar.
 */
async function syncM2M(
  businessId: string,
  packageId: string,
  table: "package_templates" | "package_outlets" | "package_photoboxes",
  column: "template_id" | "outlet_id" | "photobox_id",
  ids: string[]
) {
  const supabase = createServerClient();
  const { data: current, error: readErr } = await supabase
    .from(table)
    .select(column)
    .eq("package_id", packageId);
  if (readErr) throw new ApiError("INTERNAL", "Gagal sinkronisasi assignment");

  const next = new Set(ids);
  const prev = new Set(
    (current ?? [])
      .map((r) => (r as Record<string, string | undefined>)[column])
      .filter((id): id is string => typeof id === "string")
  );
  const toAdd = ids.filter((id) => !prev.has(id));
  const toRemove = [...prev].filter((id) => !next.has(id));

  if (toAdd.length > 0) {
    const ins = await supabase
      .from(table)
      .insert(toAdd.map((id) => ({ package_id: packageId, [column]: id })));
    if (ins.error) throw new ApiError("INTERNAL", "Gagal sinkronisasi assignment");
  }
  if (toRemove.length > 0) {
    const del = await supabase
      .from(table)
      .delete()
      .eq("package_id", packageId)
      .in(column, toRemove);
    if (del.error) throw new ApiError("INTERNAL", "Gagal sinkronisasi assignment");
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

export async function createPackage(userId: string, businessId: string, input: PackageCreateInput) {
  const parsed = packageCreateSchema.parse(input);
  await requireMembership(userId, businessId, "package:write");

  const supabase = createServerClient();
  const [limits, { count }] = await Promise.all([
    requirePlanLimits(businessId),
    supabase
      .from("packages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
  ]);
  if (planLimitError(count ?? 0, limits.max_packages)) {
    throw new ApiError(
      "PLAN_LIMIT_REACHED",
      `Plan Anda dibatasi ${limits.max_packages} paket. Upgrade untuk menambah.`
    );
  }

  await Promise.all([
    assertTemplatesAssignable(businessId, parsed.template_ids),
    assertIdsOwned(businessId, "outlets", parsed.outlet_ids),
    assertIdsOwned(businessId, "photoboxes", parsed.photobox_ids),
  ]);

  const { template_ids, outlet_ids, photobox_ids, ...fields } = parsed;
  const { data, error } = await supabase
    .from("packages")
    .insert({ business_id: businessId, ...fields })
    .select("id, name, price")
    .single();
  if (error) {
    // Trigger 0085 menolak paket yang melewati max_packages (P0001).
    const e = error as { message?: string; code?: string };
    if (e.code === "P0001" || /PLAN_LIMIT_REACHED/i.test(e.message ?? "")) {
      throw new ApiError("PLAN_LIMIT_REACHED", "Batas jumlah paket untuk plan Anda tercapai");
    }
    throw new ApiError("INTERNAL", "Gagal membuat package");
  }

  await Promise.all([
    syncM2M(businessId, data.id, "package_templates", "template_id", template_ids),
    syncM2M(businessId, data.id, "package_outlets", "outlet_id", outlet_ids),
    syncM2M(businessId, data.id, "package_photoboxes", "photobox_id", photobox_ids),
  ]);
  invalidatePublicConfig(businessId);
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

  // undefined = field tidak dikirim → jangan menyentuh assignment template.
  if (parsed.template_ids !== undefined) {
    await assertTemplatesAssignable(businessId, parsed.template_ids);
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

  if (template_ids)
    await syncM2M(businessId, packageId, "package_templates", "template_id", template_ids);
  if (outlet_ids) await syncM2M(businessId, packageId, "package_outlets", "outlet_id", outlet_ids);
  if (photobox_ids)
    await syncM2M(businessId, packageId, "package_photoboxes", "photobox_id", photobox_ids);
  invalidatePublicConfig(businessId);
  return data;
}

export async function deletePackage(userId: string, businessId: string, packageId: string) {
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
      "Package sudah dipakai transaksi: nonaktifkan saja (Switch active)."
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
  invalidatePublicConfig(businessId);
}
