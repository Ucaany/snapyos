import Link from "next/link";
import { ChevronDown, Gauge } from "lucide-react";

import { AdminTrendChart } from "@/components/dashboard/AdminTrendChart";
import { BreakdownChart } from "@/components/dashboard/BreakdownChart";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatIDR } from "@/lib/dashboard-math";
import {
  getAdminAnalytics,
  getAdminOverviewGuarded,
  getDatabaseHealth,
  getPaymentsSummary,
  getPlatformSettings,
} from "@/server/admin";

/**
 * Admin overview - docs/10 §10.1 (8 metrics) + ringkasan payment §10.3 +
 * indikator maintenance §10.4 + chart tren & breakdown provider.
 *
 * Urutan mengikuti pertanyaan yang dibawa admin ke layar ini: apa yang perlu
 * ditindak hari ini, lalu uang, lalu volume. Rincian user dilipat karena bukan
 * keputusan layar ini (pindah ke /admin/users bila perlu).
 */
export default async function AdminOverviewPage() {
  const [overview, payments, settings, analytics, health] = await Promise.all([
    getAdminOverviewGuarded(),
    getPaymentsSummary({}),
    getPlatformSettings(),
    getAdminAnalytics(30),
    getDatabaseHealth(),
  ]);

  const revenueSeries = analytics.series.map((s) => ({ date: s.date, amount: s.revenue }));
  const providerSeries = (payments.byProvider ?? []).map((p) => ({
    label: p.provider.toUpperCase(),
    amount: p.volume,
  }));

  const attention = [
    {
      label: "Antrian aktivasi manual",
      value: health.pendingReview,
      href: "/admin/subscriptions/pending-review",
    },
    { label: "Webhook error", value: health.webhookErrors, href: "/admin/payments" },
    {
      label: "Signature invalid",
      value: payments.webhookIntegrity.invalidSignature,
      href: "/admin/payments",
    },
  ];
  const needsAttention = settings.maintenance_mode || attention.some((item) => item.value > 0);

  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        size="hero"
        icon={Gauge}
        eyebrow="ADMIN - PLATFORM CONTROL"
        title="Operasi SnapyOS"
        meta={`SEMUA TENANT · AGREGAT PLATFORM · ${payments.webhookIntegrity.total} WEBHOOK TEREKAM`}
      />

      {settings.maintenance_mode ? (
        <div
          role="alert"
          className="border-2 border-ink bg-accent-2 px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.1em] text-ink"
        >
          MAINTENANCE MODE AKTIF · PLATFORM SETTING GLOBAL
        </div>
      ) : null}

      <section aria-labelledby="perlu-tindakan" className="flex flex-col gap-3">
        <h2
          id="perlu-tindakan"
          className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground"
        >
          {needsAttention ? "Perlu tindakan" : "Tidak ada antrian tertunda"}
        </h2>
        <div className="grid grid-cols-1 gap-[2px] border-2 border-ink bg-ink sm:grid-cols-3">
          {attention.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={
                "flex min-h-11 flex-col justify-between gap-2 p-3 hover:bg-muted " +
                (item.value > 0 ? "bg-accent-2" : "bg-surface")
              }
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.12em]">
                {item.label}
              </span>
              <span className="font-mono text-2xl font-bold leading-none tabular-nums">
                {item.value}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <MetricCard
          size="hero"
          accent
          label="Pendapatan Berulang Bulanan (MRR)"
          value={formatIDR(overview.mrr)}
          sub={`${overview.activeSubscribers} subscriber aktif`}
          className="md:col-span-8"
        />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:col-span-4 md:grid-cols-1">
          <MetricCard
            label="Total Bisnis"
            value={String(overview.totalBusinesses)}
            sub={`${overview.totalOutlets} outlet · ${overview.totalPhotoboxes} booth`}
          />
          <MetricCard
            label="Total Langganan"
            value={String(overview.totalSubscriptions)}
            sub="Termasuk trial / past_due / cancelled"
          />
        </div>
      </div>

      <dl
        className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink shadow-[4px_4px_0_0_#111111] md:grid-cols-4"
        aria-label="Metrik platform"
      >
        {[
          { label: "Total Sesi", value: String(overview.totalSessions) },
          { label: "Total Transaksi", value: String(overview.totalTransactions) },
          { label: "Volume Pembayaran", value: formatIDR(payments.volume) },
          { label: "Dana Dikembalikan", value: formatIDR(payments.refunded) },
        ].map((cell) => (
          <div key={cell.label} className="flex flex-col gap-2 bg-surface p-3">
            <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {cell.label}
            </dt>
            <dd className="font-mono text-sm font-bold leading-none md:text-base">{cell.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle>Pembayaran</CardTitle>
            <CardDescription>
              Volume bruto, biaya platform, dan dana bersih seluruh tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink md:grid-cols-4">
              {[
                { label: "Volume Bruto", value: formatIDR(payments.gross) },
                { label: "Biaya Platform", value: formatIDR(payments.fee) },
                { label: "Bersih (ke owner)", value: formatIDR(payments.net) },
                { label: "Lunas", value: String(payments.counts.paid ?? 0) },
                { label: "Menunggu", value: String(payments.counts.pending ?? 0) },
                { label: "Gagal", value: String(payments.counts.failed ?? 0) },
                { label: "Kedaluwarsa", value: String(payments.counts.expired ?? 0) },
                { label: "Dikembalikan", value: String(payments.counts.refunded ?? 0) },
              ].map((cell) => (
                <div key={cell.label} className="flex flex-col gap-1 bg-surface p-3">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {cell.label}
                  </dt>
                  <dd className="font-mono text-sm font-bold leading-none">{cell.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Webhook: {payments.webhookIntegrity.invalidSignature} signature invalid,{" "}
              {payments.webhookIntegrity.errors} error
            </p>
          </CardContent>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle>Pembayaran per Provider</CardTitle>
            <CardDescription>Volume IDR per gateway pada seluruh tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            {providerSeries.length ? (
              <BreakdownChart data={providerSeries} />
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                Belum ada data pembayaran untuk ditampilkan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle>Pendapatan Harian</CardTitle>
            <CardDescription>
              Pendapatan paid (IDR) 30 hari terakhir seluruh tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {revenueSeries.length ? (
              <RevenueChart data={revenueSeries} />
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                Belum ada pendapatan paid dalam 30 hari terakhir.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle>Transaksi & Sesi</CardTitle>
            <CardDescription>Tren 30 hari terakhir seluruh tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.series.length ? (
              <AdminTrendChart data={analytics.series} />
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                Belum ada transaksi atau sesi dalam 30 hari terakhir.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kesehatan Database</CardTitle>
          <CardDescription>
            Jumlah baris per tabel · {health.pendingReview} antrian aktivasi manual ·{" "}
            {health.webhookErrors} webhook error.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink md:grid-cols-4">
            {health.tables.map((t) => (
              <div key={t.name} className="flex flex-col gap-1 bg-surface p-3">
                <dt className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  {t.name}
                </dt>
                <dd className="font-mono text-sm font-bold leading-none tabular-nums">{t.count}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/admin/subscriptions/pending-review"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Antrian Aktivasi Manual ({health.pendingReview})
            </Link>
          </div>
        </CardContent>
      </Card>

      <details className="border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-5 font-mono text-[11px] font-bold uppercase tracking-[0.12em]">
          Rincian user seluruh platform
          <ChevronDown className="summary-chevron size-4" aria-hidden="true" />
        </summary>
        <div className="border-t-2 border-ink p-5">
          <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink md:grid-cols-3">
            {[
              { label: "Total", value: health.users.total, accent: true },
              { label: "Admin", value: health.users.admins },
              { label: "User", value: health.users.regular },
              { label: "Aktif", value: health.users.active },
              { label: "Suspended", value: health.users.suspended },
              { label: "Terverifikasi", value: health.users.verified },
              { label: "Belum verifikasi", value: health.users.unverified },
              { label: "Punya bisnis", value: health.users.withBusiness },
              { label: "Tanpa bisnis", value: health.users.withoutBusiness },
            ].map((cell) => (
              <div
                key={cell.label}
                className={`flex flex-col gap-1 p-3 ${cell.accent ? "bg-accent" : "bg-surface"}`}
              >
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  {cell.label}
                </dt>
                <dd className="font-mono text-sm font-bold leading-none tabular-nums">
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
