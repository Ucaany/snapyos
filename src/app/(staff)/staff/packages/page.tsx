import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PackagesTable } from "@/components/dashboard/PackagesTable";
import { PageHeader } from "@/components/ui/page-header"
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listPackages } from "@/server/packages";
import { listTemplates } from "@/server/templates";
import { listOutlets } from "@/server/outlets";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = {
  title: "Package: SnapyOS Staff",
};

/** /staff/packages, read-only (docs/04 §4.9; RBAC staff: package:read).
 * Sinkron akses booth (0018): hanya package yang tersedia di booth yang bisa
 * diakses staff (semantik sama dengan kiosk docs/05 §5.3, tanpa pembatasan
 * package_photoboxes = semua booth). */
export default async function StaffPackagesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/staff");

  const [packages, templates, outlets, photoboxes] = await Promise.all([
    listPackages(user.id, active.business.id),
    listTemplates(user.id, active.business.id),
    listOutlets(user.id, active.business.id),
    listPhotoboxes(user.id, active.business.id),
  ]);

  const accessIds = new Set(photoboxes.map((booth) => booth.id));
  const visiblePackages =
    accessIds.size === 0
      ? []
      : packages.filter(
          (pkg) => pkg.photobox_ids.length === 0 || pkg.photobox_ids.some((id) => accessIds.has(id))
        );

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="PACKAGE: READ ONLY"
        title="Package"
        description="Daftar harga & isi paket di booth yang Anda akses. Harga dikunci owner."
      />
      <PackagesTable
        packages={visiblePackages}
        templates={templates.map((t) => ({ id: t.id, name: `${t.name} (${t.category})` }))}
        outlets={outlets
          .filter((outlet) => photoboxes.some((booth) => booth.outlet_id === outlet.id))
          .map((o) => ({ id: o.id, name: o.name }))}
        photoboxes={photoboxes.map((b) => ({ id: b.id, name: b.name }))}
        canWrite={false}
      />
    </div>
  );
}
