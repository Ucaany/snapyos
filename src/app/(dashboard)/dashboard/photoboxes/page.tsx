import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PhotoboxesTable } from "@/components/dashboard/PhotoboxesTable";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listPhotoboxes } from "@/server/photoboxes";
import { listOutlets } from "@/server/outlets";
import { getPlanLimits } from "@/server/plan-limits";
import { hasFeature } from "@/server/feature-gate";

export const metadata: Metadata = {
  title: "Photobox | SnapyOS",
};

/** /dashboard/photoboxes — photobox management (docs/04 §4.6, docs/12 Phase 3). */
export default async function PhotoboxesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "photobox:write");

  const [photoboxes, outlets, limits, pwaKioskEnabled] = await Promise.all([
    listPhotoboxes(user.id, active.business.id),
    listOutlets(user.id, active.business.id),
    getPlanLimits(active.business.id),
    hasFeature(active.business.id, "pwa_kiosk"),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow={`PHOTOBOX: ${active.role.toUpperCase()}`}
        title="Photobox"
        description={`Setiap photobox punya URL perangkat sendiri: /p/${active.business.slug}/<slug-booth>. URL ini untuk device kiosk photo (bukan untuk promosi) dan untuk melihat / mengunduh foto hasil. Buka device pairing di halaman booth untuk menghubungkan kamera / printer / display.`}
      />

      <PhotoboxesTable
        photoboxes={photoboxes}
        outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        businessId={active.business.id}
        businessSlug={active.business.slug}
        canWrite={canWrite}
        maxPhotoboxes={limits.max_photoboxes}
        pwaKioskEnabled={pwaKioskEnabled}
      />
    </PageShell>
  );
}
