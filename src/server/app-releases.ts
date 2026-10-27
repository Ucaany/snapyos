/**
 * Rilis aplikasi booth untuk dashboard owner (Phase 12).
 *
 * `app_releases` global, bukan per business: satu installer dipakai semua booth.
 * Otorisasi ada di pemanggil (`/dashboard/apps` redirect untuk non-member);
 * modul ini tidak menambah filter tenant yang tidak ada di tabelnya.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { isMissingRelation } from "@/lib/supabase/errors";
import { ApiError } from "@/lib/api-errors";
import type { AppReleaseView } from "@/lib/app-release";

const COLUMNS =
  "id, version, download_url, file_name, file_size_bytes, sha256, release_notes, created_at";

/** Hanya rilis aktif: yang dinonaktifkan admin tidak boleh muncul di owner. */
export async function listOwnerReleases(): Promise<AppReleaseView[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("app_releases")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  // Migration 0081 belum diterapkan → halaman kosong, bukan 500.
  if (error && isMissingRelation(error)) return [];
  if (error) throw new ApiError("INTERNAL", "Gagal memuat rilis aplikasi");
  return (data ?? []) as AppReleaseView[];
}

export async function getLatestRelease(): Promise<AppReleaseView | null> {
  // Satu query, bukan dua: daftar aktif sudah terurut terbaru dulu.
  return (await listOwnerReleases())[0] ?? null;
}
