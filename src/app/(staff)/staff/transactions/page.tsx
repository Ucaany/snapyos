import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TransactionsView } from "@/components/dashboard/TransactionsView";
import { StaffPageHeader } from "@/components/staff/StaffPrimitives";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listStaffTransactions } from "@/server/transactions";

export const metadata: Metadata = {
  title: "Transaksi: SnapyOS",
};

type StaffTransactionsSearchParams = {
  q?: string;
  status?: string;
  method?: string;
  source?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

/** /staff/transactions — tracking transaksi read-only, dibatasi booth ter-assign. */
export default async function StaffTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<StaffTransactionsSearchParams>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/welcome");
  if (can(active.role, "transaction:read")) redirect("/dashboard/transactions");

  const query = await searchParams;
  const result = await listStaffTransactions(user.id, active.business.id, query);
  const totalPages = Math.max(1, Math.ceil(result.total / result.limit));
  const pageHref = (page: number) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
    );
    params.set("page", String(page));
    return `/staff/transactions?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10">
      <StaffPageHeader
        eyebrow={`${result.total} TRANSAKSI · BOOTH TER-ASSIGN`}
        title="Transaksi"
        description="Jejak transaksi booth yang Anda pegang. Read-only — buka detail untuk melihat URL foto hasil."
      />
      <TransactionsView
        transactions={result.rows}
        outlets={[]}
        photoboxes={[]}
        packages={[]}
        canWrite={false}
        page={result.page}
        totalPages={totalPages}
        prevHref={result.page > 1 ? pageHref(result.page - 1) : null}
        nextHref={result.page < totalPages ? pageHref(result.page + 1) : null}
        timeZone={active.business.timezone || "Asia/Jakarta"}
        detailBasePath="/staff/transactions"
      />
    </div>
  );
}
