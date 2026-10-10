import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OutletsTable } from "@/components/dashboard/OutletsTable";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listOutlets } from "@/server/outlets";
import { listPhotoboxes } from "@/server/photoboxes";
import { getPlanLimits } from "@/server/plan-limits";

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

  const [outlets, photoboxes, limits] = await Promise.all([
    listOutlets(user.id, active.business.id),
    listPhotoboxes(user.id, active.business.id),
    getPlanLimits(active.business.id),
  ]);

  const boothsByOutlet = new Map<string, number>();
  for (const booth of photoboxes) {
    boothsByOutlet.set(booth.outlet_id, (boothsByOutlet.get(booth.outlet_id) ?? 0) + 1);
  }
  const visibleOutlets = outlets
    .filter((outlet) => boothsByOutlet.has(outlet.id))
    .map((outlet) => ({ ...outlet, photobox_count: boothsByOutlet.get(outlet.id) ?? 0 }));

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="OUTLET: READ ONLY"
        title="Outlet"
        description="Lokasi photobox yang bisa Anda akses. Tambah/ubah outlet dikontrol owner."
      />
      <OutletsTable outlets={visibleOutlets} canWrite={false} maxOutlets={limits.max_outlets} />
    </div>
  );
}
