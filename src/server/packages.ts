/**
 * Package CRUD + m2m assign (outlets/photoboxes) — docs/04 §4.9,
 * docs/08 §8.7. Harga integer IDR; package = dasar final amount (server-side).
 * Assignment template dihapus 2026-11-11: semua template aktif tampil untuk
 * semua paket, jadi tabel assignment template tidak lagi dibaca/ditulis di sini.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { planLimitError } from "@/lib/plan-limits";
import { packageCopyName } from "@/lib/package-copy";
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
  package_outlets ( outlet_id ), package_photoboxes ( photobox_id )`;

type CountJoin = { outlet_id?: string } | { photobox_id?: string } | null;

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
  outlet_ids: string[];
  photobox_ids: string[];
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
  package_outlets?: CountJoin[] | CountJoin;
  package_photoboxes?: CountJoin[] | CountJoin;
}): PackageRow {
  const toArray = (
    j: CountJoin[] | CountJoin | undefined,
    key: "outlet_id" | "photobox_id"
  ): string[] => {
    if (!j) return [];
    const list = Array.isArray(j) ? j : [j];
    return list
      .map((r) => (r ? ((r as Record<string, unknown>)[key] as string | undefined) : undefined))
      .filter((v): v is string => Boolean(v));
  };
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
    outlet_ids,
    photobox_ids,
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
 * Template assignable (docs/15 §15.9b) dihapus 2026-11-11 bersama assignment
 * template: semua template aktif tampil untuk semua paket, jadi tidak ada lagi
 * himpunan template per paket yang perlu divalidasi. Aturan murni
 * `invalidTemplateIds` tetap dipakai validasi `default_template_id` booth.
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
  table: "package_outlets" | "package_photoboxes",
  column: "outlet_id" | "photobox_id",
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

/**
 * Gerbang plan `max_packages` — dipakai create DAN duplikat supaya semantik
 * limit/pesan tidak bisa menyimpang antar jalur (keduanya menambah baris paket).
 */
async function assertPackageLimit(businessId: string) {
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
}

export async function createPackage(userId: string, businessId: string, input: PackageCreateInput) {
  const parsed = packageCreateSchema.parse(input);
  await requireMembership(userId, businessId, "package:write");

  const supabase = createServerClient();
  await assertPackageLimit(businessId);

  await Promise.all([
    assertIdsOwned(businessId, "outlets", parsed.outlet_ids),
    assertIdsOwned(businessId, "photoboxes", parsed.photobox_ids),
  ]);

  const { outlet_ids, photobox_ids, ...fields } = parsed;
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

  await assertIdsOwned(businessId, "outlets", parsed.outlet_ids ?? []);
  await assertIdsOwned(businessId, "photoboxes", parsed.photobox_ids ?? []);

  const { outlet_ids, photobox_ids, ...fields } = parsed;
  const { data, error } = await supabase
    .from("packages")
    .update(fields)
    .eq("id", packageId)
    .eq("business_id", businessId)
    .select("id, name, price")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui package");
  if (!data) throw new ApiError("NOT_FOUND", "Package tidak ditemukan");

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

/**
 * Duplikat paket sebagai draft (`is_active: false`) — pola sama dengan
 * `duplicateTemplate`: salinan tidak langsung terjual sebelum owner memeriksa.
 * Hanya `package_outlets` + `package_photoboxes` yang disalin; assignment
 * template sudah tidak dipakai (semua template aktif tampil untuk semua paket).
 */
export async function duplicatePackage(userId: string, businessId: string, packageId: string) {
  await requireMembership(userId, businessId, "package:write");
  const supabase = createServerClient();

  await assertPackageLimit(businessId);

  const { data: source, error } = await supabase
    .from("packages")
    .select(COLUMNS)
    .eq("id", packageId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat package");
  if (!source) throw new ApiError("NOT_FOUND", "Package tidak ditemukan");
  const row = mapRow(source as Parameters<typeof mapRow>[0]);

  const { data: created, error: insertError } = await supabase
    .from("packages")
    .insert({
      business_id: businessId,
      name: packageCopyName(row.name),
      price: row.price,
      photo_count: row.photo_count,
      print_count: row.print_count,
      digital_output: row.digital_output,
      capture_mode: row.capture_mode,
      description: row.description,
      is_active: false,
    })
    .select("id, name")
    .single();
  if (insertError) throw new ApiError("INTERNAL", "Gagal menduplikasi package");

  await Promise.all([
    syncM2M(businessId, created.id, "package_outlets", "outlet_id", row.outlet_ids),
    syncM2M(businessId, created.id, "package_photoboxes", "photobox_id", row.photobox_ids),
  ]);
  invalidatePublicConfig(businessId);
  return created;
}
