import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PosProductsTable } from "@/components/dashboard/PosProductsTable";
import { PosBoothsTable } from "@/components/dashboard/PosBoothsTable";
import { PosReportsPanel } from "@/components/dashboard/PosReportsPanel";
import { buttonVariants } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/dashboard-math";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getPosAddOnInfo, hasPosEntitlement } from "@/server/pos-entitlement";
import { listPosBooths, listPosCategories, listPosProducts } from "@/server/pos-products";
import {
  posRevenueReport,
  posBreakdownReport,
  posVsKioskSplit,
  type PosBreakdownGroupBy,
} from "@/server/pos-reports";

export const metadata: Metadata = {
  title: "POS | SnapyOS",
};

/** /dashboard/pos — manajemen POS owner/manager (docs/pos/03 §3.2).
 *  Tanpa entitlement: halaman aktivasi (harga dari server, bukan hardcode). */
export default async function PosManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const query = await searchParams;
  const range = { from: query.from, to: query.to };

  const entitled = await hasPosEntitlement(active.business.id);
  if (!entitled) {
    const addOn = await getPosAddOnInfo();
    return (
      <div className="flex flex-col gap-8 p-6 md:p-10">
        <PageHeader
          eyebrow={`POS: ${active.role.toUpperCase()}`}
          title="POS Kasir"
          description="Terminal kasir offline di booth photobox Anda untuk menjual keychain, gantungan, dan cetak tambahan. Semua transaksi dicatat di laporan keuangan."
        />

        <EmptyState
          eyebrow="POS belum aktif"
          title={`Aktifkan add-on POS untuk ${active.business.name}`}
          body={
            addOn
              ? `Aktifkan lewat halaman subscription. Harga: ${formatIDR(addOn.priceMonthly)}/bulan per business (1 booth aktif).`
              : "Hubungi admin platform untuk harga add-on POS."
          }
          cta={
            <Link
              href="/dashboard/subscription"
              className={cn(buttonVariants())}
            >
              Aktifkan add-on POS
            </Link>
          }
        />
      </div>
    );
  }

  const canManage = can(active.role, "pos:manage");
  const canReadReports = can(active.role, "pos:read");
  const GROUPS: PosBreakdownGroupBy[] = ["product", "cashier", "outlet", "booth", "day"];
  const [products, categories, booths, revenue, split, ...breakdowns] = await Promise.all([
    listPosProducts(user.id, active.business.id),
    listPosCategories(user.id, active.business.id),
    listPosBooths(user.id, active.business.id),
    canReadReports
      ? posRevenueReport(user.id, active.business.id, range)
      : Promise.resolve(null),
    canReadReports ? posVsKioskSplit(user.id, active.business.id, range) : Promise.resolve(null),
    ...(canReadReports
      ? GROUPS.map((g) => posBreakdownReport(user.id, active.business.id, range, g))
      : GROUPS.map(() => Promise.resolve([]))),
  ]);

  return (
    <div className="flex flex-col gap-10 p-6 md:p-10">
      <PageHeader
        eyebrow={`POS: ${active.role.toUpperCase()}`}
        title="Manajemen POS"
        description="Katalog produk dipakai booth POS. Aktifkan POS di 1 booth saja (1 add-on = 1 booth), lalu staff membuka terminal kasir di /pos."
      />

      <section className="flex flex-col gap-6" aria-labelledby="pos-products-heading">
        <h2 id="pos-products-heading" className="font-display text-2xl uppercase tracking-tight">
          Produk
        </h2>
        <PosProductsTable products={products} categories={categories} canManage={canManage} />
      </section>

      <section className="flex flex-col gap-6" aria-labelledby="pos-booths-heading">
        <h2 id="pos-booths-heading" className="font-display text-2xl uppercase tracking-tight">
          Booth POS
        </h2>
        <PosBoothsTable booths={booths} canManage={canManage} />
      </section>

      {revenue && split && canReadReports ? (
        <section className="flex flex-col gap-6" aria-labelledby="pos-reports-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="pos-reports-heading" className="font-display text-2xl uppercase tracking-tight">
              Laporan POS
            </h2>
            <form
              method="get"
              action="/dashboard/pos"
              className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
              aria-label="Filter tanggal laporan POS"
            >
              <div className="flex min-w-[8.5rem] flex-1 flex-col gap-1">
                <label htmlFor="pos-from" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                  Dari
                </label>
                <DateInput
                  id="pos-from"
                  name="from"
                  defaultValue={query.from ?? ""}
                />
              </div>
              <div className="flex min-w-[8.5rem] flex-1 flex-col gap-1">
                <label htmlFor="pos-to" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                  Sampai
                </label>
                <DateInput
                  id="pos-to"
                  name="to"
                  defaultValue={query.to ?? ""}
                />
              </div>
              <button
                type="submit"
                className="h-11 border-2 border-ink bg-accent px-4 font-mono text-xs font-bold uppercase tracking-[0.08em] shadow-[2px_2px_0_0_#111111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                Terapkan
              </button>
            </form>
          </div>
          <PosReportsPanel
            timeZone={active.business.timezone || "Asia/Jakarta"}
            data={{
              revenue,
              split,
              breakdowns: {
                product: breakdowns[0] ?? [],
                cashier: breakdowns[1] ?? [],
                outlet: breakdowns[2] ?? [],
                booth: breakdowns[3] ?? [],
                day: breakdowns[4] ?? [],
              },
            }}
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {"/// revenue selalu dari transactions; breakdown dari pos_orders (snapshot nama produk)"}
          </p>
        </section>
      ) : null}
    </div>
  );
}
