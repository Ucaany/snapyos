import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StaffCatalogShell, StaffPackagesBoard } from "@/components/staff/StaffCatalog";
import { StaffPageHeader } from "@/components/staff/StaffPrimitives";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listPackages } from "@/server/packages";
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

  const [packages, photoboxes] = await Promise.all([
    listPackages(user.id, active.business.id),
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
    <div className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10">
      <StaffPageHeader
        eyebrow="PACKAGE · READ ONLY"
        title="Package"
        description="Daftar harga & isi paket di booth yang Anda akses. Harga dikunci owner."
        aside={
          <div className="border-2 border-ink bg-bg px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              PAKET TERSEDIA
            </p>
            <p className="font-mono text-xl font-bold leading-none">
              {String(visiblePackages.length).padStart(2, "0")} PAKET
            </p>
          </div>
        }
      />
      <StaffCatalogShell
        title="PACKAGE.REGISTER"
        meta={`${String(visiblePackages.length).padStart(2, "0")} PAKET`}
      >
        <StaffPackagesBoard
          packages={visiblePackages}
          timeZone={active.business.timezone || "Asia/Jakarta"}
        />
      </StaffCatalogShell>
    </div>
  );
}
