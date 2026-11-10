import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { requireAdmin } from "./guard";

const COLUMNS =
  "id, version, channel, min_windows_version, architecture, file_name, object_key, content_type, file_size_bytes, sha256, changelog, compatibility_notes, is_active, is_deprecated, published_at, created_at, updated_at";

export type InstallerRow = {
  id: string;
  version: string;
  channel: string;
  min_windows_version: string;
  architecture: string;
  file_name: string;
  object_key: string;
  content_type: string;
  file_size_bytes: number;
  sha256: string;
  changelog: string | null;
  compatibility_notes: string | null;
  is_active: boolean;
  is_deprecated: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Admin read for audit/migration. Catalog writes are retired. */
export async function listInstallers(): Promise<InstallerRow[]> {
  await requireAdmin();
  const { data, error } = await createServerClient()
    .from("installer_catalog")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat katalog installer");
  return (data ?? []) as InstallerRow[];
}
