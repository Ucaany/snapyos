import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { TxInsightsPanel } from "@/components/dashboard/TxInsightsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { destinationFor } from "@/lib/destination";
import { can } from "@/lib/rbac";
import { formatDate, formatIDR } from "@/lib/dashboard-math";
import { getActiveBusiness, getUserMemberships, requireUser } from "@/lib/tenant";

import { getDashboardSummary, getOperationalMetrics, getRevenueSeries } from "@/server/dashboard";
import { getTxInsights } from "@/server/analytics";
import { getActiveSubscription } from "@/server/business";

export const metadata: Metadata = {
  title: "Dashboard | SnapyOS",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const memberships = await getUserMemberships(user.id);

  // --- Onboarding: user belum punya business (docs/04 onboarding) ---
  const dest = destinationFor(memberships);
  if (dest !== "/dashboard") redirect(dest);

  // --- Overview revenue business aktif (docs/12 Phase 2, AC 35–38) ---
  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/welcome");

  const financialAccess = can(active.role, "transaction:read");

  const query = await searchParams;
  const range = { from: query.from, to: query.to };
  const businessId = active.business.id;

  const subscription = await getActiveSubscription(businessId);
  let summary: Awaited<ReturnType<typeof getDashboardSummary>> | null = null;
  let series: Awaited<ReturnType<typeof getRevenueSeries>> | null = null;
  let txInsights: Awaited<ReturnType<typeof getTxInsights>> | null = null;
  let metrics: Awaited<ReturnType<typeof getOperationalMetrics>>;

  if (financialAccess) {
    [summary, series, metrics, txInsights] = await Promise.all([
      getDashboardSummary(user.id, businessId, range),
      getRevenueSeries(user.id, businessId, range),
      getOperationalMetrics(user.id, businessId, range),
      getTxInsights(user.id, businessId, range),
    ]);
  } else {
    metrics = await getOperationalMetrics(user.id, businessId, range);
  }

  const fromDate = summary?.range.from ?? metrics.range.from;
  const toDate = summary?.range.to ?? metrics.range.to;
  const tz = active.business.timezone || "Asia/Jakarta";
  // Tanggal rentang adalah hari kalender bisnis → format dengan tz bisnis
  // agar label tidak bergeser sehari untuk trafik malam WIB.
  const periodLabel = `${formatDate(fromDate + "T00:00:00Z", tz)} → ${formatDate(
    toDate + "T00:00:00Z",
    tz
  )}`;

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow={`DASHBOARD: ${active.role.toUpperCase()}`}
        title={active.business.name}
        meta={
          <span>
            /p/{active.business.slug} · {active.business.timezone} · PLAN{" "}
            {subscription?.plan?.name ?? "Tidak ada paket"} /{" "}
            {subscription?.status ?? "Tidak diketahui"}
          </span>
        }
        right={
          <DateRangeFilter
            from={fromDate}
            to={toDate}
            timeZone={active.business.timezone || "Asia/Jakarta"}
          />
        }
      />

      {!financialAccess || !summary || !series ? (
        <Card className="border-destructive bg-surface">
          <CardHeader>
            <CardTitle>Akses finansial terbatas</CardTitle>
            <CardDescription>
              Role {active.role.toUpperCase()} tidak melihat data revenue. Hubungi owner untuk akses
              penuh dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <MetricCard
              size="hero"
              accent
              label="Pendapatan Bersih: Periode"
              value={formatIDR(summary.net)}
              sub={`${summary.paidTx} transaksi berhasil · ${periodLabel}`}
              className="md:col-span-8"
            />
            <div className="grid grid-cols-1 gap-6 md:col-span-4 sm:grid-cols-2 md:grid-cols-1">
              <MetricCard
                label="Pendapatan Kotor"
                value={formatIDR(summary.gross)}
                sub="Sebelum diskon"
              />
              <MetricCard
                label="Diskon Voucher"
                value={formatIDR(summary.discount)}
                sub="Dipotong dari kotor"
              />
            </div>
          </div>

          <dl
            className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink shadow-[4px_4px_0_0_#111111] md:grid-cols-4 xl:grid-cols-8"
            aria-label="Ringkasan metrik"
          >
            {[
              { label: "Hari Ini", value: formatIDR(summary.revenueToday) },
              { label: "Bulan Ini", value: formatIDR(summary.revenueMonth) },
              { label: "Transaksi Paid", value: String(summary.paidTx) },
              { label: "Rata-rata / Tx", value: formatIDR(summary.avgTransaction) },
              { label: "Sesi Foto", value: String(metrics.sessions) },
              { label: "Pelanggan", value: String(metrics.customers) },
              { label: "Booth Online", value: String(metrics.activePhotoboxes) },
              { label: "Outlet Aktif", value: String(metrics.activeOutlets) },
            ].map((cell) => (
              <div key={cell.label} className="flex flex-col gap-2 bg-surface p-3">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {cell.label}
                </dt>
                <dd className="font-mono text-sm font-bold leading-none md:text-base">
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>

          {txInsights && (
            <TxInsightsPanel
              insights={txInsights.insights}
              rangeLabel={`${txInsights.range.from} → ${txInsights.range.to}`}
            />
          )}

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Pendapatan Harian</CardTitle>
                <CardDescription>
                  Nilai akhir setelah diskon per hari: {periodLabel}.
                </CardDescription>
              </div>
              <span className="border-2 border-ink bg-accent px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.1em]">
                Total {formatIDR(series.total)}
              </span>
            </CardHeader>
            <CardContent>
              {summary.paidTx === 0 ? (
                <EmptyState
                  eyebrow="BELUM ADA TRANSAKSI"
                  title="Belum ada pendapatan"
                  body="Pendapatan muncul setelah photobox aktif dan pelanggan pertama membayar. Tambahkan booth melalui menu Photobox."
                  cta={
                    <Button render={<Link href="/dashboard/photoboxes" />}>
                      Ke Halaman Photobox
                    </Button>
                  }
                />
              ) : (
                <RevenueChart data={series.series} timeZone={tz} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
