import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { formatBp, formatIDR } from "@/lib/dashboard-math";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getBusinessMetrics } from "@/server/metrics";

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
      <div className="p-6 md:p-10">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Akses finansial terbatas</CardTitle>
            <CardDescription>
              Role {active.role.toUpperCase()} tidak melihat data revenue.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const query = await searchParams;
  const metrics = await getBusinessMetrics(user.id, active.business.id, {
    from: query.from,
    to: query.to,
  });

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow={`METRIK: ${active.business.name.toUpperCase()}`}
        title="Metrik Bisnis"
        description={`${metrics.range.from} → ${metrics.range.to}. Semua angka konsisten dengan Dashboard & Transaksi (sumber: transactions paid).`}
        right={
          <DateRangeFilter
            from={metrics.range.from}
            to={metrics.range.to}
            timeZone={active.business.timezone || "Asia/Jakarta"}
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

      <div
        className="grid grid-cols-1 gap-[2px] border-2 border-ink bg-ink shadow-[4px_4px_0_0_#111111] lg:grid-cols-3"
        aria-label="Ringkasan metrik"
      >
        {[
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
        ].map((cell) => (
          <div key={cell.label} className="flex flex-col gap-2 bg-surface p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {cell.label}
            </p>
            <p className="font-mono text-base font-bold leading-none">{cell.value}</p>
          </div>
        ))}
      </div>

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
    </div>
  );
}
