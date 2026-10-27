/**
 * Admin Katalog Aplikasi — docs/10 §10.7 (migration 0081).
 *
 * Hanya TAUTAN: file APK/EXE diunggah admin ke Google Drive, tidak pernah
 * melewati storage SNAPY OS. Tidak ada upload, bucket, atau presigned PUT di
 * sini — modul ini tidak menyentuh src/server/storage/* maupun R2.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { isMissingRelation } from "@/lib/supabase/errors";
import { ApiError } from "@/lib/api-errors";
import {
  appReleaseSchema,
  appReleaseUpdateSchema,
  appReleaseWriteError,
  type AppReleaseInput,
  type AppReleaseUpdateInput,
} from "@/lib/validators";
import { requireAdmin, audit } from "./guard";

export type AdminAppReleaseRow = {
  id: string;
  version: string;
  download_url: string;
  file_name: string;
  file_size_bytes: number | null;
  sha256: string | null;
  release_notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, version, download_url, file_name, file_size_bytes, sha256, release_notes, is_active, created_at, updated_at";

function writeError(error: { code?: string } | null, fallback: string): never {
  const mapped = appReleaseWriteError(error, fallback);
  throw new ApiError(mapped.code, mapped.message, mapped.fieldErrors ?? {});
}

export async function listAppReleases(): Promise<AdminAppReleaseRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("app_releases")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  // Migration 0081 belum diterapkan → halaman kosong, bukan 500.
  if (error && isMissingRelation(error)) return [];
  if (error) throw new ApiError("INTERNAL", "Gagal memuat katalog aplikasi");
  return (data ?? []) as AdminAppReleaseRow[];
}

export async function createAppRelease(input: AppReleaseInput): Promise<AdminAppReleaseRow> {
  const admin = await requireAdmin();
  const parsed = appReleaseSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("app_releases")
    .insert({ ...parsed, created_by: admin.id })
    .select(COLUMNS)
    .single();
  if (error) writeError(error, "Gagal menyimpan rilis aplikasi");
  await audit(admin.id, "admin.app_release.create", data!.id, { version: parsed.version });
  return data as AdminAppReleaseRow;
}

export async function updateAppRelease(
  releaseId: string,
  input: AppReleaseUpdateInput
): Promise<AdminAppReleaseRow> {
  const admin = await requireAdmin();
  const parsed = appReleaseUpdateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("app_releases")
    .update(parsed)
    .eq("id", releaseId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) writeError(error, "Gagal memperbarui rilis aplikasi");
  if (!data) throw new ApiError("NOT_FOUND", "Rilis aplikasi tidak ditemukan");
  await audit(admin.id, "admin.app_release.update", releaseId, { ...parsed });
  return data as AdminAppReleaseRow;
}

export async function setAppReleaseActive(
  releaseId: string,
  isActive: boolean
): Promise<AdminAppReleaseRow> {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("app_releases")
    .update({ is_active: isActive })
    .eq("id", releaseId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal mengubah status rilis");
  if (!data) throw new ApiError("NOT_FOUND", "Rilis aplikasi tidak ditemukan");
  await audit(admin.id, "admin.app_release.set_active", releaseId, { is_active: isActive });
  return data as AdminAppReleaseRow;
}

/** Hapus baris katalog saja — tidak ada objek storage yang ikut dihapus. */
export async function deleteAppRelease(releaseId: string) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("app_releases")
    .delete()
    .eq("id", releaseId)
    .select("id, version")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus rilis aplikasi");
  if (!data) throw new ApiError("NOT_FOUND", "Rilis aplikasi tidak ditemukan");
  await audit(admin.id, "admin.app_release.delete", releaseId, { version: data.version });
  return data;
}
