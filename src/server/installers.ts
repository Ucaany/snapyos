import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { getMembership } from "@/lib/tenant";
import { resolveStorage } from "@/server/storage";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/constants";
import { isInstallerCompatible, isPublishedInstaller } from "@/lib/installer-compatibility";
import type { InstallerRow } from "@/server/admin/installers";

const COLUMNS =
  "id, version, channel, min_windows_version, architecture, file_name, object_key, content_type, file_size_bytes, sha256, changelog, compatibility_notes, is_active, is_deprecated, published_at, created_at, updated_at";
export type OwnerInstaller = Omit<
  InstallerRow,
  "object_key" | "is_active" | "is_deprecated" | "published_at"
> & {
  download_url: string;
  installed_versions: { photobox_id: string; name: string; version: string | null }[];
};

type DeviceRow = { id: string; name: string; device_status: Record<string, unknown> | null };

async function requireOwner(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (membership.role !== "owner") throw new ApiError("FORBIDDEN", "Akses khusus owner");
}

export async function listOwnerInstallers(
  userId: string,
  businessId: string,
  windows?: "10" | "11",
  architecture?: "x64" | "x86" | "arm64" | "universal"
) {
  await requireOwner(userId, businessId);
  const supabase = createServerClient();
  const [{ data, error }, { data: boxes, error: boxError }] = await Promise.all([
    supabase
      .from("installer_catalog")
      .select(COLUMNS)
      .eq("is_active", true)
      .eq("is_deprecated", false)
      .not("published_at", "is", null)
      .order("created_at", { ascending: false }),
    supabase.from("photoboxes").select("id, name, device_status").eq("business_id", businessId),
  ]);
  if (error || boxError) throw new ApiError("INTERNAL", "Gagal memuat katalog installer");
  const devices = (boxes ?? []) as DeviceRow[];
  const rows = ((data ?? []) as InstallerRow[]).filter((row) => {
    if (!isPublishedInstaller(row)) return false;
    if (!windows || !architecture) return true;
    return isInstallerCompatible({
      min_windows_version: row.min_windows_version as "10" | "11",
      architecture: row.architecture as "x64" | "x86" | "arm64" | "universal",
      windows,
      requestedArchitecture: architecture,
    });
  });
  const storage = await Promise.all(
    rows.map(async (row) => [row, await resolveStorage("business-assets", row.object_key)] as const)
  );
  const out: OwnerInstaller[] = [];
  for (const [row, provider] of storage) {
    const { data: signed } = await provider.createSignedUrl(
      "business-assets",
      row.object_key,
      SIGNED_URL_TTL_SECONDS,
      { download: row.file_name }
    );
    if (!signed?.signedUrl) continue;
    out.push({
      ...row,
      download_url: signed.signedUrl,
      installed_versions: devices.map((device) => ({
        photobox_id: device.id,
        name: device.name,
        version:
          typeof device.device_status?.app_version === "string"
            ? device.device_status.app_version
            : null,
      })),
    });
  }
  return out;
}
