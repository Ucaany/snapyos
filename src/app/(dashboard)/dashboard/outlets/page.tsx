import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OutletsTable } from "@/components/dashboard/OutletsTable";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listOutlets } from "@/server/outlets";
import { getPlanLimits } from "@/server/plan-limits";

export const metadata: Metadata = {
  title: "Outlet | SnapyOS",
};

/** /dashboard/outlets — outlet management (docs/04 §4.7, docs/12 Phase 3). */
export default async function OutletsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "outlet:write");

  const [outlets, limits] = await Promise.all([
    listOutlets(user.id, active.business.id),
    getPlanLimits(active.business.id),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow={`OUTLET: ${active.role.toUpperCase()}`}
        title="Outlet"
        description={`Outlet adalah lokasi fisik bisnis Anda. Setiap photobox terpasang di satu outlet. Contoh: ${active.business.name}, Malioboro, Booth 01.`}
      />

      <OutletsTable outlets={outlets} canWrite={canWrite} maxOutlets={limits.max_outlets} />
    </PageShell>
  );
}
