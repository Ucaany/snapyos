import { AccessDeniedPanel } from "@/components/dashboard/AccessDeniedPanel";
import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AlertStrip } from "@/components/dashboard/AlertStrip";
import { BoothStatusGrid } from "@/components/dashboard/BoothStatusGrid";
import { BreakdownPanel } from "@/components/dashboard/BreakdownPanel";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { TxInsightsPanel } from "@/components/dashboard/TxInsightsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { destinationFor } from "@/lib/destination";
import { can } from "@/lib/rbac";
import { formatDate, formatIDR } from "@/lib/dashboard-math";
import { getActiveBusinessForRoles, getUserMemberships, requireUser } from "@/lib/tenant";

import {
  getBoothHealth,
  getDashboardAlerts,
  getDashboardBreakdowns,
  getDashboardSummary,
  getOperationalMetrics,
  getRevenueDelta,
  getRevenueSeries,
} from "@/server/dashboard";
import { getTxInsights } from "@/server/analytics";
import { getActiveSubscription } from "@/server/business";

export const metadata: Metadata = {
  title: "Dashboard | SnapyOS",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  trialing: "Uji coba",
  trial: "Uji coba",
  past_due: "Tertunggak",
  cancelled: "Dibatalkan",
  canceled: "Dibatalkan",
  expired: "Kedaluwarsa",
  pending: "Menunggu",
};

function SectionHeading({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
      <h2 id={id}>{label}</h2>
      <span aria-hidden className="h-px flex-1 bg-ink/30" />
    </div>
  );
}

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
  const active = await getActiveBusinessForRoles(user.id, ["owner", "manager"]);
  if (!active) redirect("/welcome");

  const financialAccess = can(active.role, "transaction:read");

  const query = await searchParams;
  const range = { from: query.from, to: query.to };
  const businessId = active.business.id;

  // Blok operasional dihitung untuk SEMUA role dashboard: status booth, alert,
  // dan metrik operasional tidak bergantung pada akses finansial (docs/04 §4.1).
  const [subscription, boothHealth, metrics] = await Promise.all([
    getActiveSubscription(businessId),
    getBoothHealth(user.id, businessId),
    getOperationalMetrics(user.id, businessId, range),
  ]);
  const alerts = await getDashboardAlerts(user.id, businessId, { boothHealth, subscription });

  const financial = financialAccess
    ? await Promise.all([
        getDashboardSummary(user.id, businessId, range),
        getRevenueSeries(user.id, businessId, range),
        getRevenueDelta(user.id, businessId, range),
        getDashboardBreakdowns(user.id, businessId, range),
        getTxInsights(user.id, businessId, range),
      ])
    : null;
  const [summary, series, delta, breakdowns, txInsights] = financial ?? [
    null,
    null,
    null,
    null,
    null,
  ];

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
    <PageShell>
      <PageHeader
        eyebrow={`DASHBOARD: ${active.role.toUpperCase()}`}
        title={active.business.name}
        meta={
          <span>
            /p/{active.business.slug} · {active.business.timezone} · PAKET{" "}
            {subscription?.plan?.name ?? "Tidak ada paket"} ·{" "}
            {STATUS_LABEL[subscription?.status ?? ""] ?? "Status tidak diketahui"}
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

      <AlertStrip alerts={alerts} />

      {/* Operasional: terlihat semua role dashboard. */}
      <section aria-labelledby="booth-status" className="flex flex-col gap-3">
        <SectionHeading
          id="booth-status"
          label={`STATUS BOOTH ${String(boothHealth.online).padStart(2, "0")}/${String(
            boothHealth.total
          ).padStart(2, "0")} ONLINE`}
        />
        <StatStrip
          label="Ringkasan operasional"
          columns={6}
          items={[
            {
              label: "Booth Online",
              value: String(boothHealth.online),
              tone: "text-accent-3-strong",
            },
            { label: "Booth Offline", value: String(boothHealth.offline) },
            { label: "Perawatan", value: String(boothHealth.maintenance) },
            { label: "Sesi Foto", value: String(metrics.sessions) },
            { label: "Pelanggan", value: String(metrics.customers) },
            { label: "Outlet Aktif", value: String(metrics.activeOutlets) },
          ]}
        />
        <BoothStatusGrid items={boothHealth.items} />
      </section>

      {!financialAccess || !summary || !series || !delta || !breakdowns ? (
        <AccessDeniedPanel resource="revenue" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <MetricCard
              size="hero"
              accent
              label="Pendapatan Bersih: Periode"
              value={formatIDR(summary.net)}
              sub={`${summary.paidTx} transaksi berhasil · ${periodLabel}`}
              deltaBp={delta.deltaBp}
              deltaLabel={`vs ${formatIDR(delta.previous)} periode lalu`}
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

          <StatStrip
            label="Ringkasan metrik"
            columns={4}
            items={[
              { label: "Hari Ini", value: formatIDR(summary.revenueToday) },
              { label: "Bulan Ini", value: formatIDR(summary.revenueMonth) },
              { label: "Transaksi Lunas", value: String(summary.paidTx) },
              { label: "Rata-rata / Transaksi", value: formatIDR(summary.avgTransaction) },
            ]}
          />

          <BreakdownPanel breakdowns={breakdowns} />

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
    </PageShell>
  );
}
