import { AccessDeniedPanel } from "@/components/dashboard/AccessDeniedPanel";
import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { HourlyChart } from "@/components/dashboard/HourlyChart";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { formatBp, formatIDR } from "@/lib/dashboard-math";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getBusinessMetrics } from "@/server/metrics";
import { getPaidTxInsights } from "@/server/analytics";
import { getRevenueSeries } from "@/server/dashboard";

export const metadata: Metadata = {
  title: "Metrik: SnapyOS",
};

/** /dashboard/metrics — metrik operasional menyeluruh (docs/04 §4.3). */
export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (!can(active.role, "transaction:read")) {
    return (
      <PageShell>
        <AccessDeniedPanel resource="revenue" />
      </PageShell>
    );
  }

  const query = await searchParams;
  const range = { from: query.from, to: query.to };
  const timeZone = active.business.timezone || "Asia/Jakarta";
  const [metrics, paidInsights, series] = await Promise.all([
    getBusinessMetrics(user.id, active.business.id, range),
    getPaidTxInsights(user.id, active.business.id, range),
    getRevenueSeries(user.id, active.business.id, range),
  ]);

  const bestDay =
    series.total > 0
      ? series.series.reduce<{ date: string; amount: number } | null>(
          (best, day) => (day.amount > (best?.amount ?? 0) ? day : best),
          null
        )
      : null;
  const avgDuration = metrics.sessions.avgDurationSeconds;

  return (
    <PageShell>
      <PageHeader
        eyebrow={`METRIK: ${active.business.name.toUpperCase()}`}
        title="Metrik Bisnis"
        description={`${metrics.range.from} → ${metrics.range.to}. Semua angka konsisten dengan Dashboard & Transaksi (sumber: transactions paid).`}
        right={
          <DateRangeFilter
            from={metrics.range.from}
            to={metrics.range.to}
            timeZone={timeZone}
            basePath="/dashboard/metrics"
          />
        }
      />

      <section aria-label="Revenue" className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <MetricCard
          accent
          size="hero"
          className="md:col-span-6"
          label="Pendapatan Net"
          value={formatIDR(metrics.revenue.net)}
          sub={`${metrics.transactions.paid} transaksi paid`}
        />
        <div className="grid grid-cols-1 gap-6 md:col-span-6 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
          <MetricCard label="Gross" value={formatIDR(metrics.revenue.gross)} sub="Sebelum diskon" />
          <MetricCard
            label="Diskon"
            value={formatIDR(metrics.revenue.discount)}
            sub="Voucher terpakai"
          />
          <MetricCard
            label="Pertumbuhan"
            value={formatBp(metrics.revenue.growthBp)}
            sub={`vs ${formatIDR(metrics.revenue.previousNet)} periode lalu`}
          />
        </div>
      </section>

      <section aria-label="Metrik unggulan" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {paidInsights.insights.peakHour !== null && (
          <MetricCard
            label="Jam Ramai"
            value={`${String(paidInsights.insights.peakHour).padStart(2, "0")}:00–${String(
              paidInsights.insights.peakHour
            ).padStart(2, "0")}:59`}
            sub={`${paidInsights.insights.peakCount} transaksi`}
          />
        )}
        {bestDay && (
          <MetricCard
            label="Hari Terbaik"
            value={formatIDR(bestDay.amount)}
            sub={new Date(bestDay.date + "T00:00:00Z").toLocaleDateString("id-ID", {
              timeZone,
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          />
        )}
        {metrics.photobox.popularPackage && (
          <MetricCard
            label="Paket Terlaris"
            value={metrics.photobox.popularPackage}
            sub="Paket paling banyak terjual"
          />
        )}
        {avgDuration > 0 && (
          <MetricCard
            label="Rata-rata Durasi Sesi"
            value={`${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`}
            sub="Sesi selesai"
          />
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Jam Ramai (Transaksi Paid)</CardTitle>
          <CardDescription>
            Distribusi transaksi berhasil per jam lokal ({timeZone}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HourlyChart
            hourly={paidInsights.insights.hourly}
            peakHour={paidInsights.insights.peakHour}
            peakCount={paidInsights.insights.peakCount}
          />
        </CardContent>
      </Card>

      <StatStrip
        label="Ringkasan metrik"
        columns={9}
        items={[
          { label: "Sesi Foto", value: String(metrics.sessions.total) },
          { label: "Sesi Selesai", value: String(metrics.sessions.completed) },
          { label: "Sesi Batal", value: String(metrics.sessions.cancelled) },
          { label: "Total Retake", value: String(metrics.sessions.retakes) },
          {
            label: "Durasi Rata-rata",
            value: `${Math.floor(metrics.sessions.avgDurationSeconds / 60)}m ${metrics.sessions.avgDurationSeconds % 60}s`,
          },
          { label: "Pelanggan Total", value: String(metrics.customers.total) },
          { label: "Pelanggan Baru", value: String(metrics.customers.new) },
          { label: "Pelanggan Kembali", value: String(metrics.customers.returning) },
          { label: "Tx Gagal", value: String(metrics.transactions.failed) },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Performa Photobox</CardTitle>
          <CardDescription>
            Sesi &amp; net revenue per booth · package terpopuler:{" "}
            {metrics.photobox.popularPackage ?? "TIDAK ADA"} · template terpakai:{" "}
            {metrics.photobox.popularTemplate ?? "TIDAK ADA"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.photobox.booths.length === 0 ? (
            <EmptyState eyebrow="BELUM ADA PHOTOBOX" title="Belum ada booth terdaftar" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full md:min-w-[420px] border-collapse text-left">
                <caption className="sr-only">Performa per photobox</caption>
                <thead>
                  <tr className="border-b-2 border-ink font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-4">
                      Booth
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right">
                      Sesi
                    </th>
                    <th scope="col" className="py-2 text-right">
                      Pendapatan Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.photobox.booths.map((b) => (
                    <tr key={b.id} className="border-b-2 border-ink/10 font-mono text-xs">
                      <td className="py-2 pr-4 font-bold uppercase">{b.name}</td>
                      <td className="py-2 pr-4 text-right">{b.sessions}</td>
                      <td className="py-2 text-right font-bold">{formatIDR(b.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
