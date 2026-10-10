import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VouchersTable } from "@/components/dashboard/VouchersTable";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listVouchers, getVoucherAnalyticsBatch } from "@/server/vouchers";
import { listPackages } from "@/server/packages";
import { listOutlets } from "@/server/outlets";

export const metadata: Metadata = {
  title: "Voucher | SnapyOS",
};

/** /dashboard/vouchers — CRUD voucher + analytics inline (docs/04 §4.11). */
export default async function VouchersPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "voucher:write");

  const businessId = active.business.id;
  const [vouchers, packages, outlets] = await Promise.all([
    listVouchers(user.id, businessId),
    listPackages(user.id, businessId),
    listOutlets(user.id, businessId),
  ]);

  const analytics = await getVoucherAnalyticsBatch(
    user.id,
    businessId,
    vouchers.map((v) => v.id)
  );

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow={`VOUCHER: ${active.role.toUpperCase()}`}
        title="Voucher"
        description="Voucher tervalidasi server-side saat checkout: periode, usage limit, minimum transaksi, dan eligibility package/outlet."
      />

      <VouchersTable
        vouchers={vouchers}
        analytics={analytics}
        packages={packages.map((p) => ({ id: p.id, name: p.name }))}
        outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        canWrite={canWrite}
      />
    </div>
  );
}
