import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StaffPanel } from "@/components/dashboard/StaffPanel";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listStaffDirectory } from "@/server/staff";
import { listPhotoboxes } from "@/server/photoboxes";
import { getPlanLimits } from "@/server/plan-limits";

export const metadata: Metadata = {
  title: "Tim | SnapyOS",
};

/** /dashboard/staff — RBAC staff management + akses booth (docs/04 §4.13, migrasi 0018). */
export default async function StaffPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (active.role !== "owner") {
    return (
      <div className="p-6 md:p-10">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Hanya owner</CardTitle>
            <CardDescription>
              Pengelolaan staff (role, membership, akses booth) adalah hak owner.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const photoboxes = await listPhotoboxes(user.id, active.business.id);
  const [{ rows, totals }, limits] = await Promise.all([
    listStaffDirectory(
      user.id,
      active.business.id,
      active.business.timezone || "Asia/Jakarta",
      photoboxes.map((p) => ({ id: p.id, name: p.name, status: p.status }))
    ),
    getPlanLimits(active.business.id),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="TIM: AKSES BOOTH"
        title="Tim & Akses Booth"
        description="Kelola tim, role, dan booth yang bisa diakses tiap member. Transaksi hari ini dihitung dari transaksi berstatus PAID hari ini (zona waktu business) pada booth yang di-assign ke member tersebut."
      />

      <StaffPanel
        staff={rows}
        totals={totals}
        photoboxes={photoboxes.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          outletName: p.outlet_name,
        }))}
        currentUserId={user.id}
        maxStaff={limits.max_staff}
      />
    </PageShell>
  );
}
