import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StaffCatalogShell, StaffOutletsBoard } from "@/components/staff/StaffCatalog";
import { StaffPageHeader } from "@/components/staff/StaffPrimitives";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listOutlets } from "@/server/outlets";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = {
  title: "Outlet: SnapyOS Staff",
};

/** /staff/outlets, read-only (docs/04 §4.7; RBAC staff: outlet:read).
 * Sinkron akses booth (0018): hanya outlet yang punya booth yang bisa diakses staff. */
export default async function StaffOutletsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/staff");

  const [outlets, photoboxes] = await Promise.all([
    listOutlets(user.id, active.business.id),
    listPhotoboxes(user.id, active.business.id),
  ]);

  const boothsByOutlet = new Map<string, number>();
  for (const booth of photoboxes) {
    boothsByOutlet.set(booth.outlet_id, (boothsByOutlet.get(booth.outlet_id) ?? 0) + 1);
  }
  const visibleOutlets = outlets
    .filter((outlet) => boothsByOutlet.has(outlet.id))
    .map((outlet) => ({ ...outlet, photobox_count: boothsByOutlet.get(outlet.id) ?? 0 }));

  return (
    <div className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10">
      <StaffPageHeader
        eyebrow="OUTLET · READ ONLY"
        title="Outlet"
        description="Lokasi photobox yang bisa Anda akses. Tambah/ubah outlet dikontrol owner."
        aside={
          <div className="border-2 border-ink bg-bg px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              LOKASI AKSES
            </p>
            <p className="font-mono text-xl font-bold leading-none">
              {String(visibleOutlets.length).padStart(2, "0")} OUTLET
            </p>
          </div>
        }
      />
      <StaffCatalogShell
        title="OUTLET.REGISTER"
        meta={`${String(visibleOutlets.length).padStart(2, "0")} LOKASI`}
      >
        <StaffOutletsBoard outlets={visibleOutlets} />
      </StaffCatalogShell>
    </div>
  );
}
