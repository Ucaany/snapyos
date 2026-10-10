import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SubscriptionPanel } from "@/components/dashboard/SubscriptionPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getSubscriptionOverview } from "@/server/subscription";

export const metadata: Metadata = {
  title: "Langganan — SnapyOS",
};

/** /dashboard/subscription — docs/02 billing, docs/04 §4.16, docs/12 Phase 10. */
export default async function SubscriptionPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "subscription:write");

  const overview = await getSubscriptionOverview(user.id, active.business.id);

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="SUBSCRIPTION — PLAN & TAGIHAN"
        title="Langganan"
        description="Kelola plan aktif, add-on, dan riwayat invoice."
      />

      {overview.subscription ? (
        <SubscriptionPanel
          subscription={overview.subscription}
          usage={overview.usage}
          invoices={overview.invoices}
          plans={overview.plans}
          addOns={overview.addOns}
          canWrite={canWrite}
        />
      ) : (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Subscription tidak ditemukan</CardTitle>
            <CardDescription>
              Business ini belum punya subscription aktif. Hubungi dukungan bila
              berlanjut.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
              {`BUSINESS: ${active.business.slug}`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
