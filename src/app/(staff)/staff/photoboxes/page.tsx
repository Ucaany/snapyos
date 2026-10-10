import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PhotoboxesTable } from "@/components/dashboard/PhotoboxesTable";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listPhotoboxes } from "@/server/photoboxes";
import { listOutlets } from "@/server/outlets";
import { getPlanLimits } from "@/server/plan-limits";

export const metadata: Metadata = {
  title: "Booth: SnapyOS Staff",
};

/** /staff/photoboxes, read-only (docs/04 §4.6; RBAC staff: photobox:read). */
export default async function StaffPhotoboxesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/staff");

  const [photoboxes, outlets, limits] = await Promise.all([
    listPhotoboxes(user.id, active.business.id),
    listOutlets(user.id, active.business.id),
    getPlanLimits(active.business.id),
  ]);

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="BOOTH: READ ONLY"
        title="Photobox"
        description="Pantau status booth & URL perangkat. Perubahan konfigurasi dikontrol owner."
      />
      <PhotoboxesTable
        photoboxes={photoboxes}
        outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        businessId={active.business.id}
        businessSlug={active.business.slug}
        canWrite={false}
        maxPhotoboxes={limits.max_photoboxes}
      />
    </div>
  );
}
