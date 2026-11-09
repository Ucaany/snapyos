import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DeviceManagement } from "@/components/dashboard/DeviceManagement";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listOwnerInstallers } from "@/server/installers";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = { title: "Perangkat | SnapyOS" };

export default async function DevicesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const [photoboxes, installers] = await Promise.all([
    listPhotoboxes(user.id, active.business.id),
    active.role === "owner"
      ? listOwnerInstallers(user.id, active.business.id, "10", "x64").catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-10">
      <PageHeader
        eyebrow="PERANGKAT · PAIRING · DIAGNOSTIK"
        title="Manajemen Perangkat"
        description="Hubungkan booth, cabut perangkat lama, pantau status kamera dan printer, cek versi aplikasi, lalu unduh installer yang kompatibel. Tampilan kiosk lama tetap dibaca runtime, tetapi tidak lagi diubah dari dashboard."
      />
      <DeviceManagement
        businessId={active.business.id}
        businessSlug={active.business.slug}
        photoboxes={photoboxes}
        installers={installers.map((item) => ({
          id: item.id,
          version: item.version,
          channel: item.channel,
          fileName: item.file_name,
          fileSizeBytes: item.file_size_bytes,
          sha256: item.sha256,
          downloadUrl: item.download_url,
          changelog: item.changelog,
          installedVersions: item.installed_versions,
        }))}
        canWrite={can(active.role, "photobox:write")}
      />
    </div>
  );
}
