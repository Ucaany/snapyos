import {
  Building2,
  CreditCard,
  Gauge,
  Percent,
  Receipt,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";

import {
  AdminBreakdownChart,
  AdminDonutChart,
  AdminRevenueChart,
  AdminTrendChart,
} from "@/components/admin/AdminCharts";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPagedTable } from "@/components/admin/AdminPagedBlocks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { Alert, AlertDescription, AlertTitle } from "@/components/admin/ui/alert";
import { Badge } from "@/components/admin/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Progress } from "@/components/admin/ui/progress";
import { TableCell, TableHead, TableRow } from "@/components/admin/ui/table";
import { formatIDR } from "@/lib/dashboard-math";
import { cn } from "@/lib/utils";
import {
  getAdminAnalytics,
  getAdminOverviewGuarded,
  getDatabaseHealth,
  getInfraHealth,
  getPaymentsSummary,
  getSubscriptionStats,
  getPlatformSettings,
} from "@/server/admin";

/**
 * Admin overview - docs/10 §10.1 (8 metrics) + ringkasan payment §10.3 +
 * indikator maintenance §10.4 + chart tren & breakdown provider.
 */
export default async function AdminOverviewPage() {
  const [overview, payments, settings, analytics, health, infra, subscriptionStats] =
    await Promise.all([
      getAdminOverviewGuarded(),
      getPaymentsSummary({}),
      getPlatformSettings(),
      getAdminAnalytics(30),
      getDatabaseHealth(),
      getInfraHealth(),
      getSubscriptionStats(),
    ]);
  const { supabase, vps, cloudflare } = infra;
  const numberFormat = new Intl.NumberFormat("id-ID");

  const revenueSeries = analytics.series.map((s) => ({ date: s.date, amount: s.revenue }));
  const providerSeries = (payments.byProvider ?? []).map((p) => ({
    label: p.provider.toUpperCase(),
    amount: p.volume,
  }));

  const paymentStatusSeries = [
    {
      key: "paid",
      label: "Lunas",
      value: payments.counts.paid ?? 0,
      color: "var(--chart-2)",
      tone: "emerald",
      note: "Dana sudah masuk dan fee platform dihitung.",
      action: "Selesai",
    },
    {
      key: "pending",
      label: "Menunggu",
      value: payments.counts.pending ?? 0,
      color: "var(--chart-4)",
      tone: "amber",
      note: "Invoice dibuat, pembayaran belum dikonfirmasi.",
      action: "Pantau",
    },
    {
      key: "failed",
      label: "Gagal",
      value: payments.counts.failed ?? 0,
      color: "var(--chart-1)",
      tone: "rose",
      note: "Gateway menolak atau signature tidak valid.",
      action: "Cek webhook",
    },
    {
      key: "expired",
      label: "Kedaluwarsa",
      value: payments.counts.expired ?? 0,
      color: "#a3a3a3",
      tone: "neutral",
      note: "Melewati batas waktu bayar tanpa settlement.",
      action: "Arsip",
    },
  ];
  const statusDonut = paymentStatusSeries.filter((status) => status.value > 0);
  const paidCount = payments.counts.paid ?? 0;
  const totalPayments = paymentStatusSeries.reduce((total, status) => total + status.value, 0);
  const successRatio = totalPayments ? (paidCount / totalPayments) * 100 : 0;
  const needsAction = (payments.counts.pending ?? 0) + (payments.counts.failed ?? 0);

  const webhookTotal = payments.webhookIntegrity.total;
  const invalidSignature = payments.webhookIntegrity.invalidSignature;
  const webhookErrors = payments.webhookIntegrity.errors;
  const webhookValid = Math.max(0, webhookTotal - invalidSignature);
  const validPct = webhookTotal ? Math.round((webhookValid / webhookTotal) * 100) : 0;
  const webhookIssues = invalidSignature > 0 || webhookErrors > 0;

  const revenueToday = analytics.series[analytics.series.length - 1]?.revenue ?? 0;
  const last7 = analytics.series.slice(-7);
  const previous7 = analytics.series.slice(-14, -7);
  const revenue7 = last7.reduce((sum, day) => sum + day.revenue, 0);
  const revenuePrev7 = previous7.reduce((sum, day) => sum + day.revenue, 0);
  const revenue30 = analytics.series.reduce((sum, day) => sum + day.revenue, 0);
  const delta7 = revenuePrev7 > 0 ? ((revenue7 - revenuePrev7) / revenuePrev7) * 100 : null;
  const tx7 = last7.reduce((sum, day) => sum + day.txCount, 0);
  const revenuePeak = analytics.series.reduce(
    (peak, day) => (day.revenue > peak.revenue ? day : peak),
    analytics.series[0] ?? { date: "", revenue: 0, txCount: 0, sessionCount: 0 }
  );
  const revenueMax = Math.max(1, ...analytics.series.map((day) => day.revenue));
  const revenueScale = [
    {
      label: "Hari ini",
      value: revenueToday,
      share: revenue30 ? (revenueToday / revenue30) * 100 : 0,
    },
    { label: "7 hari", value: revenue7, share: revenue30 ? (revenue7 / revenue30) * 100 : 0 },
    { label: "30 hari", value: revenue30, share: 100 },
  ];
  const averageTicket = paidCount > 0 ? Math.round(payments.gross / paidCount) : 0;

  const subscriptionScale = [
    {
      key: "active",
      label: "Aktif",
      value: subscriptionStats.statusCounts.active ?? 0,
      color: "var(--chart-2)",
      note: "Periode berjalan dan masih efektif.",
    },
    {
      key: "trial",
      label: "Trial",
      value: subscriptionStats.statusCounts.trial ?? 0,
      color: "var(--chart-3)",
      note: "Masa uji coba sebelum aktivasi.",
    },
    {
      key: "past_due",
      label: "Lewat tempo",
      value: subscriptionStats.statusCounts.past_due ?? 0,
      color: "var(--chart-4)",
      note: "Menunggu pembayaran perpanjangan.",
    },
    {
      key: "cancelled",
      label: "Dibatalkan",
      value: subscriptionStats.statusCounts.cancelled ?? 0,
      color: "#a3a3a3",
      note: "Berhenti atas permintaan owner.",
    },
    {
      key: "expired",
      label: "Kedaluwarsa",
      value: subscriptionStats.statusCounts.expired ?? 0,
      color: "#737373",
      note: "Periode habis tanpa perpanjangan.",
    },
  ];

  const webhookErrorRate = webhookTotal ? (webhookErrors / webhookTotal) * 100 : 0;
  const invalidRate = webhookTotal ? (invalidSignature / webhookTotal) * 100 : 0;
  const apiChecks = [
    {
      label: "Latensi Supabase",
      value: formatLatency(supabase.apiLatencyMs),
      state:
        supabase.apiLatencyMs === null
          ? "unknown"
          : supabase.apiLatencyMs < 300
            ? "ok"
            : supabase.apiLatencyMs < 800
              ? "warn"
              : "bad",
      note: "Uji kueri count dari server",
    },
    {
      label: "Webhook error",
      value: `${numberFormat.format(webhookErrors)} (${webhookErrorRate.toFixed(2).replace(".", ",")}%)`,
      state: webhookErrorRate < 1 ? "ok" : webhookErrorRate < 5 ? "warn" : "bad",
      note: `${numberFormat.format(webhookTotal)} webhook terekam`,
    },
    {
      label: "Signature invalid",
      value: `${numberFormat.format(invalidSignature)} (${invalidRate.toFixed(2).replace(".", ",")}%)`,
      state: invalidRate < 1 ? "ok" : invalidRate < 5 ? "warn" : "bad",
      note: "Ditolak sebelum settlement",
    },
    {
      label: "Webhook sukses",
      value: `${numberFormat.format(webhookValid)} (${(100 - webhookErrorRate).toFixed(2).replace(".", ",")}%)`,
      state: webhookErrorRate < 1 ? "ok" : webhookErrorRate < 5 ? "warn" : "bad",
      note: "Diproses tanpa error",
    },
  ] as const;
  const apiStatus = apiChecks.some((check) => check.state === "bad")
    ? "bad"
    : apiChecks.some((check) => check.state === "warn")
      ? "warn"
      : "ok";

  const totalRows = health.tables.reduce((total, table) => total + table.count, 0);
  const activityMatrix = analytics.series.slice(-14).map((day) => ({
    date: day.date,
    revenue: day.revenue,
    transactions: day.txCount,
    sessions: day.sessionCount,
  }));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Gauge}
        title="Ringkasan platform"
        meta={`Agregat seluruh tenant · ${numberFormat.format(payments.webhookIntegrity.total)} webhook terekam.`}
      />

      {settings.maintenance_mode ? (
        <Alert variant="destructive">
          <AlertTitle>Maintenance mode aktif</AlertTitle>
          <AlertDescription>Platform setting global sedang membatasi akses.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="admin-overview-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-overview-metrics"
          title="Ikhtisar"
          description="Angka kunci seluruh tenant SnapyOS."
        />

        {/* KPI grid sengaja seragam (R-14): angka dibandingkan sebaris mata,
            jadi ukuran dan padding harus sama. Hierarki dibawa oleh satu
            card fokus (accent) plus tone semantik, bukan variasi bentuk. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={TrendingUp}
            label="Pendapatan berulang bulanan (MRR)"
            value={formatIDR(overview.mrr)}
            sub={`${overview.activeSubscribers} pelanggan aktif`}
          />
          <AdminMetricCard
            tone="sky"
            icon={Building2}
            label="Total bisnis"
            value={String(overview.totalBusinesses)}
            sub={`${overview.totalOutlets} outlet · ${overview.totalPhotoboxes} booth`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={Receipt}
            label="Total langganan"
            value={String(overview.totalSubscriptions)}
            sub="Termasuk trial, lewat tempo, dan berhenti"
          />
          <AdminMetricCard
            tone="sky"
            icon={CreditCard}
            label="Total transaksi"
            value={String(overview.totalTransactions)}
            sub={`${overview.totalSessions} sesi foto`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader>
              <CardTitle>Skala pendapatan &amp; kondisi API</CardTitle>
              <CardDescription>
                Pendapatan berjalan dan kesehatan jalur data platform.
              </CardDescription>
              <CardAction>
                <Badge
                  variant={
                    apiStatus === "bad"
                      ? "destructive"
                      : apiStatus === "warn"
                        ? "default"
                        : "secondary"
                  }
                >
                  {apiStatus === "bad" ? "Gangguan" : apiStatus === "warn" ? "Pantau" : "Normal"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="grid items-start gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-xs font-medium text-muted-foreground">Skala pendapatan</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {delta7 === null
                      ? "Belum ada pembanding"
                      : `${delta7 >= 0 ? "+" : ""}${delta7.toFixed(1).replace(".", ",")}% vs 7 hari sebelumnya`}
                  </span>
                </div>
                <ul className="flex flex-col gap-3">
                  {revenueScale.map((row) => (
                    <li key={row.label} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm">{row.label}</span>
                        <span className="text-sm font-medium tabular-nums">
                          {formatIDR(row.value)}
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={`${row.label}: ${formatIDR(row.value)}, ${Math.round(row.share)}% dari 30 hari`}
                      >
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(100, Math.max(2, row.share))}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <AdminStatGrid
                  columns={2}
                  className="border-t pt-4"
                  items={[
                    {
                      label: "Rata-rata harian",
                      value: formatIDR(
                        Math.round(revenue30 / Math.max(1, analytics.series.length))
                      ),
                      hint: "30 hari terakhir",
                    },
                    {
                      label: "Hari tertinggi",
                      value: formatIDR(revenuePeak.revenue),
                      hint: shortDate(revenuePeak.date),
                    },
                    {
                      label: "Transaksi 7 hari",
                      value: numberFormat.format(tx7),
                    },
                    {
                      label: "Rata-rata tiket",
                      value: formatIDR(averageTicket),
                    },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-4 border-t pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6">
                <h3 className="text-xs font-medium text-muted-foreground">Kondisi API</h3>
                <ul className="flex flex-col gap-3">
                  {apiChecks.map((check) => (
                    <li key={check.label} className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm">{check.label}</span>
                        <span className="text-xs text-muted-foreground">{check.note}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-medium tabular-nums">{check.value}</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[11px]",
                            check.state === "bad"
                              ? "text-destructive"
                              : check.state === "warn"
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-emerald-700 dark:text-emerald-400"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              check.state === "bad"
                                ? "bg-destructive"
                                : check.state === "warn"
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            )}
                            aria-hidden="true"
                          />
                          {check.state === "bad"
                            ? "Gangguan"
                            : check.state === "warn"
                              ? "Pantau"
                              : "Normal"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex flex-col gap-1.5 border-t pt-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Ambang status</p>
                  <p>Latensi: Normal &lt;300 ms · Pantau &lt;800 ms · Gangguan ≥800 ms.</p>
                  <p>Error rate: Normal &lt;1% · Pantau &lt;5% · Gangguan ≥5%.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t pt-4 md:col-span-2">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">Pendapatan harian 30 hari</span>
                  <span className="text-muted-foreground tabular-nums">
                    tertinggi {formatIDR(revenuePeak.revenue)} · {shortDate(revenuePeak.date)}
                  </span>
                </div>
                <div
                  className="flex h-16 items-end gap-[3px]"
                  role="img"
                  aria-label={`Grafik batang pendapatan harian 30 hari, tertinggi ${formatIDR(revenuePeak.revenue)} pada ${shortDate(revenuePeak.date)}`}
                >
                  {analytics.series.map((day) => (
                    <span
                      key={day.date}
                      className="flex-1 rounded-[2px] bg-emerald-500/70 dark:bg-emerald-400/60"
                      style={{ height: `${Math.max(6, (day.revenue / revenueMax) * 100)}%` }}
                      title={`${day.date}: ${formatIDR(day.revenue)}`}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader>
              <CardTitle>Skala langganan</CardTitle>
              <CardDescription>
                {numberFormat.format(subscriptionStats.total)} langganan ·{" "}
                {numberFormat.format(subscriptionStats.effectiveActive)} efektif.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">
                  {numberFormat.format(subscriptionStats.trialsEndingSoon)} trial berakhir ≤3 hari
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-3">
                {subscriptionScale.map((row) => {
                  const share = subscriptionStats.total
                    ? (row.value / subscriptionStats.total) * 100
                    : 0;
                  return (
                    <li key={row.key} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm">{row.label}</span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                          <span className="text-sm font-medium">
                            {numberFormat.format(row.value)}
                          </span>
                          <span className="w-10 text-right text-xs text-muted-foreground">
                            {share.toFixed(share >= 10 ? 0 : 1).replace(".", ",")}%
                          </span>
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={`${row.label}: ${row.value} subscription (${Math.round(share)}%)`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share))}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              <AdminStatGrid
                columns={2}
                className="border-t pt-4"
                items={[
                  {
                    label: "Perpanjangan ≤7 hari",
                    value: numberFormat.format(subscriptionStats.renewalsDueSoon),
                  },
                  {
                    label: "Trial berakhir ≤3 hari",
                    value: numberFormat.format(subscriptionStats.trialsEndingSoon),
                  },
                  { label: "Lewat tempo", value: numberFormat.format(subscriptionStats.pastDue) },
                  {
                    label: "Review aktivasi",
                    value: numberFormat.format(health.pendingReview),
                  },
                ]}
              />

              {subscriptionStats.planSplit.length ? (
                <div className="flex flex-col gap-2 border-t pt-4">
                  <p className="text-xs text-muted-foreground">MRR per paket</p>
                  <ul className="flex flex-col gap-2">
                    {subscriptionStats.planSplit.map((plan) => (
                      <li
                        key={plan.planName}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="truncate">{plan.planName}</span>
                        <span className="flex shrink-0 items-center gap-2 tabular-nums">
                          <span className="text-muted-foreground">
                            {numberFormat.format(plan.count)} langganan
                          </span>
                          <span className="font-medium">{formatIDR(plan.mrr)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="admin-overview-activity" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-overview-activity"
          title="Aktivitas"
          description="Tren 30 hari terakhir."
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pendapatan harian</CardTitle>
              <CardDescription>Pembayaran lunas 30 hari terakhir.</CardDescription>
            </CardHeader>
            <CardContent>
              {revenueSeries.length ? (
                <AdminRevenueChart data={revenueSeries} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Belum ada pendapatan paid dalam 30 hari terakhir.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transaksi &amp; sesi</CardTitle>
              <CardDescription>Volume harian 30 hari terakhir.</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.series.length ? (
                <AdminTrendChart data={analytics.series} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Belum ada transaksi atau sesi dalam 30 hari terakhir.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="admin-overview-payments" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-overview-payments"
          title="Pembayaran"
          description="Agregat seluruh gateway pembayaran tenant."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            tone="emerald"
            icon={Wallet}
            label="Volume bruto"
            value={formatIDR(payments.gross)}
            sub={`${numberFormat.format(paidCount)} pembayaran lunas`}
          />
          <AdminMetricCard
            tone="amber"
            icon={Percent}
            label="Biaya platform"
            value={formatIDR(payments.fee)}
            sub="Sesuai paket tenant aktif"
          />
          <AdminMetricCard
            tone="sky"
            icon={TrendingUp}
            label="Bersih ke owner"
            value={formatIDR(payments.net)}
            sub="Setelah potongan platform"
          />
          <AdminMetricCard
            tone="amber"
            icon={RotateCcw}
            label="Dikembalikan"
            value={formatIDR(payments.refunded)}
            sub="Payment berstatus refunded"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle>Status pembayaran</CardTitle>
              <CardDescription>Komposisi seluruh pembayaran.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {statusDonut.length ? (
                <AdminDonutChart
                  data={statusDonut}
                  showLegend={false}
                  center={{ label: "pembayaran", value: numberFormat.format(totalPayments) }}
                />
              ) : (
                <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                  Belum ada payment terekam.
                </p>
              )}

              <ul className="flex flex-col divide-y border-t">
                {paymentStatusSeries.map((status) => {
                  const share = totalPayments ? (status.value / totalPayments) * 100 : 0;
                  return (
                    <li
                      key={status.key}
                      className="flex flex-col gap-1 py-2.5 first:pt-3 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: status.color }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm font-medium">{status.label}</span>
                          <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                            {status.action}
                          </Badge>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                          <span className="text-sm font-semibold">
                            {numberFormat.format(status.value)}
                          </span>
                          <span className="w-10 text-right text-xs text-muted-foreground">
                            {share.toFixed(share >= 10 ? 0 : 1).replace(".", ",")}%
                          </span>
                        </span>
                      </div>
                      <p className="pl-4 text-xs leading-relaxed text-muted-foreground">
                        {status.note}
                      </p>
                    </li>
                  );
                })}
              </ul>

              <AdminStatGrid
                columns={2}
                className="border-t pt-4"
                items={[
                  { label: "Rasio sukses", value: `${successRatio.toFixed(1).replace(".", ",")}%` },
                  { label: "Rata-rata tiket", value: formatIDR(averageTicket) },
                  { label: "Perlu tindakan", value: numberFormat.format(needsAction) },
                  { label: "Total pembayaran", value: numberFormat.format(totalPayments) },
                ]}
              />
            </CardContent>
          </Card>

          <Card className="xl:col-span-8">
            <CardHeader>
              <CardTitle>Volume per provider</CardTitle>
              <CardDescription>Distribusi volume pembayaran seluruh waktu.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {providerSeries.length ? (
                <AdminBreakdownChart data={providerSeries} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Belum ada data pembayaran untuk ditampilkan.
                </p>
              )}
              {payments.byProvider.length ? (
                <AdminStatGrid
                  items={payments.byProvider.map((provider) => ({
                    label: provider.provider.toUpperCase(),
                    value: `${numberFormat.format(provider.count)} transaksi`,
                    hint: formatIDR(provider.volume),
                  }))}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader>
              <CardTitle>Tenant teratas</CardTitle>
              <CardDescription>Diurutkan dari volume bruto terbesar.</CardDescription>
            </CardHeader>
            <CardContent>
              <AdminPagedTable
                itemLabel="tenant"
                pageSize={5}
                empty={
                  <p className="text-sm text-muted-foreground">
                    Belum ada tenant dengan pembayaran lunas.
                  </p>
                }
                header={
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Trx</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Bruto</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Fee</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Bersih</TableHead>
                  </TableRow>
                }
                rows={payments.byTenant.map((tenant) => (
                  <TableRow key={tenant.businessId}>
                    <TableCell className="w-full max-w-0 truncate font-medium">
                      {tenant.businessName}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {numberFormat.format(tenant.count)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatIDR(tenant.gross)}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                      {formatIDR(tenant.fee)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatIDR(tenant.net)}
                    </TableCell>
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader>
              <CardTitle>Integritas webhook</CardTitle>
              <CardDescription>
                {numberFormat.format(webhookTotal)} webhook terekam.
              </CardDescription>
              <CardAction>
                <Badge variant={webhookIssues ? "destructive" : "secondary"}>
                  {webhookIssues ? "Perlu dicek" : "Sehat"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Signature valid</span>
                  <span className="text-sm font-semibold tabular-nums">{validPct}%</span>
                </div>
                <Progress
                  value={validPct}
                  className="gap-0"
                  aria-label="Persentase signature valid"
                />
              </div>
              <AdminStatGrid
                columns={2}
                items={[
                  { label: "Total webhook", value: numberFormat.format(webhookTotal) },
                  { label: "Signature valid", value: numberFormat.format(webhookValid) },
                  { label: "Signature invalid", value: numberFormat.format(invalidSignature) },
                  { label: "Status error", value: numberFormat.format(webhookErrors) },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="admin-overview-health" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-overview-health"
          title="Kesehatan platform"
          description="Supabase, VPS, dan sebaran akun."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            tone="neutral"
            icon={Users}
            label="Total user"
            value={numberFormat.format(health.users.total)}
            sub={`${health.users.admins} admin · ${health.users.regular} user`}
          />
          <AdminMetricCard
            tone="emerald"
            icon={UserCheck}
            label="User aktif"
            value={numberFormat.format(health.users.active)}
            sub={`${health.users.suspended} suspended`}
          />
          <AdminMetricCard
            tone="sky"
            icon={ShieldCheck}
            label="Terverifikasi"
            value={numberFormat.format(health.users.verified)}
            sub={`${health.users.unverified} belum verifikasi`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={Building2}
            label="Punya bisnis"
            value={numberFormat.format(health.users.withBusiness)}
            sub={`${health.users.withoutBusiness} tanpa bisnis`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader>
              <CardTitle>Kesehatan Supabase</CardTitle>
              <CardDescription>
                Postgres {health.tables.length} tabel inti · {numberFormat.format(totalRows)} baris
                data.
              </CardDescription>
              <CardAction>
                <Badge variant={supabase.reachable ? "secondary" : "destructive"}>
                  {supabase.reachable ? "Terhubung" : "Gangguan"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <UsageMeter
                  label="Koneksi database"
                  value={
                    supabase.activeConnections !== null && supabase.maxConnections
                      ? `${numberFormat.format(supabase.activeConnections)} / ${numberFormat.format(supabase.maxConnections)}`
                      : "Tidak ada data"
                  }
                  pct={
                    supabase.activeConnections !== null && supabase.maxConnections
                      ? Math.round((supabase.activeConnections / supabase.maxConnections) * 100)
                      : null
                  }
                  detail="Sesi aktif terhadap batas max_connections."
                />
                <UsageMeter
                  label="Rasio cache"
                  value={
                    supabase.cacheHitRatio !== null
                      ? `${numberFormat.format(supabase.cacheHitRatio)}%`
                      : "Tidak ada data"
                  }
                  pct={supabase.cacheHitRatio}
                  invert
                  detail="Rasio baca dari shared buffers."
                />
              </div>

              <AdminStatGrid
                columns={2}
                items={[
                  { label: "Ukuran database", value: formatBytes(supabase.dbSizeBytes) },
                  { label: "Penyimpanan aplikasi", value: formatBytes(supabase.storageUsedBytes) },
                  {
                    label: "Objek storage",
                    value:
                      supabase.storageObjectCount === null
                        ? "Tidak ada data"
                        : numberFormat.format(supabase.storageObjectCount),
                  },
                  { label: "Latensi API", value: formatLatency(supabase.apiLatencyMs) },
                  { label: "Total baris", value: numberFormat.format(totalRows) },
                  { label: "Tabel inti", value: numberFormat.format(health.tables.length) },
                ]}
              />

              {supabase.dbSizeBytes === null ? (
                <p className="text-xs text-muted-foreground">
                  Ukuran database, koneksi, dan cache butuh migrasi{" "}
                  <code className="font-mono">0092_admin_db_health.sql</code>.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader>
              <CardTitle>Matriks aktivitas</CardTitle>
              <CardDescription>
                14 hari terakhir · {numberFormat.format(health.users.active)} akun aktif.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <ActivityMatrix days={activityMatrix} />
              <AdminStatGrid
                columns={2}
                className="pt-1"
                items={[
                  { label: "Total user", value: numberFormat.format(health.users.total) },
                  { label: "Suspended", value: numberFormat.format(health.users.suspended) },
                  { label: "Terverifikasi", value: numberFormat.format(health.users.verified) },
                  {
                    label: "Belum verifikasi",
                    value: numberFormat.format(health.users.unverified),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader>
              <CardTitle>Kesehatan VPS</CardTitle>
              <CardDescription>
                {vps.platform} {vps.release} · {vps.arch} · {vps.cpuCount} vCPU
              </CardDescription>
              <CardAction>
                <Badge
                  variant={vps.loadPct >= 85 || vps.memPct >= 90 ? "destructive" : "secondary"}
                >
                  {vps.loadPct >= 85 || vps.memPct >= 90 ? "Beban tinggi" : "Normal"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-5">
                <UsageMeter
                  label="RAM"
                  value={`${formatBytes(vps.memUsed)} / ${formatBytes(vps.memTotal)}`}
                  pct={vps.memPct}
                  detail={`${vps.memPct}% terpakai · ${formatBytes(vps.memFree)} bebas`}
                />
                <UsageMeter
                  label="Disk"
                  value={
                    vps.diskUsed !== null && vps.diskTotal !== null
                      ? `${formatBytes(vps.diskUsed)} / ${formatBytes(vps.diskTotal)}`
                      : "Tidak ada data"
                  }
                  pct={vps.diskPct}
                  detail={
                    vps.diskFree !== null
                      ? `${formatBytes(vps.diskFree)} bebas di volume utama`
                      : "Metrik disk tidak tersedia."
                  }
                />
                <UsageMeter
                  label="CPU load (1m)"
                  value={`${vps.load1.toFixed(2)} / ${vps.cpuCount} vCPU`}
                  pct={vps.loadPct}
                  detail={`Load 5m ${vps.load5.toFixed(2)} · 15m ${vps.load15.toFixed(2)}`}
                />
              </div>

              <AdminStatGrid
                columns={2}
                className="border-t pt-4"
                items={[
                  { label: "Waktu aktif host", value: formatUptime(vps.uptimeSec) },
                  { label: "Waktu aktif proses", value: formatUptime(vps.processUptimeSec) },
                  { label: "RAM proses", value: formatBytes(vps.processRss) },
                  { label: "vCPU", value: numberFormat.format(vps.cpuCount) },
                  {
                    label: "Bandwidth masuk",
                    value: formatNetwork(vps.netRxBytes, vps.netRxMbps),
                    hint: vps.netRxBytes === null ? "Metrik jaringan butuh Linux (VPS)" : undefined,
                  },
                  {
                    label: "Bandwidth keluar",
                    value: formatNetwork(vps.netTxBytes, vps.netTxMbps),
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader>
              <CardTitle>Cloudflare Edge</CardTitle>
              <CardDescription>
                {cloudflare.ok
                  ? `${numberFormat.format(cloudflare.requests ?? 0)} request hari ini · ${numberFormat.format(cloudflare.uniques ?? 0)} pengunjung unik.`
                  : cloudflare.configured
                    ? "Token aktif, data gagal dimuat."
                    : "Belum dikonfigurasi."}
              </CardDescription>
              <CardAction>
                <Badge
                  variant={
                    !cloudflare.configured
                      ? "secondary"
                      : cloudflare.ok
                        ? (cloudflare.threats ?? 0) > 0
                          ? "destructive"
                          : "secondary"
                        : "destructive"
                  }
                >
                  {!cloudflare.configured
                    ? "Setup"
                    : cloudflare.ok
                      ? (cloudflare.threats ?? 0) > 0
                        ? "Ada ancaman"
                        : "Normal"
                      : "Error"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {cloudflare.ok ? (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <UsageMeter
                      label="Rasio cache"
                      value={
                        cloudflare.cacheRatio !== null
                          ? `${numberFormat.format(cloudflare.cacheRatio)}%`
                          : "Tidak ada data"
                      }
                      pct={cloudflare.cacheRatio}
                      invert
                      detail={`${numberFormat.format(cloudflare.cachedRequests ?? 0)} dari ${numberFormat.format(cloudflare.requests ?? 0)} request dilayani dari cache.`}
                    />
                    <UsageMeter
                      label="Ancaman diblokir"
                      value={numberFormat.format(cloudflare.threats ?? 0)}
                      pct={
                        cloudflare.requests
                          ? Math.min(
                              100,
                              Math.round(((cloudflare.threats ?? 0) / cloudflare.requests) * 100)
                            )
                          : 0
                      }
                      detail={
                        (cloudflare.threats ?? 0) > 0
                          ? "Bot dan request mencurigakan yang ditandai WAF Cloudflare."
                          : "Tidak ada request yang ditandai WAF."
                      }
                    />
                  </div>

                  <AdminStatGrid
                    columns={2}
                    items={[
                      {
                        label: "Tayangan halaman",
                        value: numberFormat.format(cloudflare.pageViews ?? 0),
                      },
                      { label: "Bandwidth edge", value: formatBytes(cloudflare.bytes) },
                      {
                        label: "Error 4xx",
                        value: numberFormat.format(cloudflare.clientErrors ?? 0),
                      },
                      {
                        label: "Error 5xx",
                        value: numberFormat.format(cloudflare.serverErrors ?? 0),
                      },
                    ]}
                  />

                  {cloudflare.countries.length ? (
                    <div className="flex flex-col gap-2 border-t pt-4">
                      <p className="text-xs text-muted-foreground">Negara teratas</p>
                      <ul className="flex flex-col gap-1.5">
                        {cloudflare.countries.map((country) => (
                          <li
                            key={country.code}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {country.code}
                            </span>
                            <span className="flex items-center gap-3 tabular-nums">
                              <span>{numberFormat.format(country.requests)} permintaan</span>
                              {country.threats > 0 ? (
                                <Badge variant="destructive" className="h-5 px-1.5 text-[11px]">
                                  {numberFormat.format(country.threats)} ancaman
                                </Badge>
                              ) : (
                                <span className="w-16 text-right text-muted-foreground">aman</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <p>
                    {cloudflare.configured
                      ? (cloudflare.error ?? "Data Cloudflare tidak tersedia.")
                      : `Isi ${cloudflare.missing.join(" dan ")} untuk menampilkan traffic edge, cache, dan ancaman bot.`}
                  </p>
                  {!cloudflare.configured ? (
                    <>
                      <p className="text-xs">
                        Token API butuh izin{" "}
                        <span className="font-medium">Zone &gt; Analytics &gt; Read</span> untuk
                        zone yang sama dengan CLOUDFLARE_ZONE_ID.
                      </p>
                      <p className="text-xs">
                        Verifikasi cepat:{" "}
                        <code className="font-mono">node scripts/cloudflare-check.mjs</code>
                      </p>
                    </>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

/** Matriks 14 hari × 3 metrik: intensitas warna per hari, angka total di kanan. */
function ActivityMatrix({
  days,
}: {
  days: { date: string; revenue: number; transactions: number; sessions: number }[];
}) {
  if (!days.length) {
    return <p className="text-sm text-muted-foreground">Belum ada aktivitas 14 hari terakhir.</p>;
  }

  const count = new Intl.NumberFormat("id-ID");
  const rows = [
    {
      label: "Pendapatan",
      color: "16, 185, 129",
      values: days.map((day) => day.revenue),
      total: formatIDR(days.reduce((sum, day) => sum + day.revenue, 0)),
      format: (value: number) => formatIDR(value),
    },
    {
      label: "Transaksi",
      color: "14, 165, 233",
      values: days.map((day) => day.transactions),
      total: count.format(days.reduce((sum, day) => sum + day.transactions, 0)),
      format: (value: number) => count.format(value),
    },
    {
      label: "Sesi Foto",
      color: "139, 92, 246",
      values: days.map((day) => day.sessions),
      total: count.format(days.reduce((sum, day) => sum + day.sessions, 0)),
      format: (value: number) => count.format(value),
    },
  ];

  const first = days[0];
  const last = days[days.length - 1];

  return (
    <div
      className="flex flex-col gap-4"
      role="img"
      aria-label={`Matriks intensitas 14 hari untuk ${rows.map((row) => row.label).join(", ")}`}
    >
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const max = Math.max(1, ...row.values);
          return (
            <div key={row.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <span className="text-xs font-medium tabular-nums">{row.total}</span>
              </div>
              <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
                {row.values.map((value, index) => (
                  <span
                    key={days[index]?.date ?? index}
                    title={`${row.label} ${days[index]?.date ?? ""}: ${row.format(value)}`}
                    className="aspect-square rounded-[3px] ring-1 ring-black/5 ring-inset dark:ring-white/10"
                    style={{
                      backgroundColor: `rgba(${row.color}, ${(0.08 + (value / max) * 0.82).toFixed(3)})`,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{shortDate(first?.date)}</span>
        <span className="flex items-center gap-1.5">
          Sedikit
          <span className="h-1.5 w-14 rounded-full bg-emerald-500/40 dark:bg-emerald-400/40" />
          Banyak
        </span>
        <span>{shortDate(last?.date)}</span>
      </div>
    </div>
  );
}

function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const [, month, day] = iso.split("-");
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const name = names[Number(month) - 1];
  return name ? `${Number(day)} ${name}` : iso;
}

function UsageMeter({
  label,
  value,
  pct,
  detail,
  invert = false,
}: {
  label: string;
  value: string;
  pct: number | null;
  detail?: string;
  /** true = angka tinggi itu bagus (mis. cache hit ratio). */
  invert?: boolean;
}) {
  const tone =
    pct === null
      ? "bg-muted-foreground/40"
      : invert
        ? pct >= 95
          ? "bg-emerald-500"
          : pct >= 85
            ? "bg-amber-500"
            : "bg-destructive"
        : pct >= 90
          ? "bg-destructive"
          : pct >= 75
            ? "bg-amber-500"
            : "bg-emerald-500";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">{value}</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", tone)}
          style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
        />
      </div>
      {detail ? <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "Tidak ada data";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = value >= 100 || unit === 0 ? 0 : 1;
  return `${value.toFixed(decimals).replace(".", ",")} ${units[unit]}`;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "Tidak ada data";
  return `${new Intl.NumberFormat("id-ID").format(ms)} ms`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

function formatNetwork(bytes: number | null, mbps: number | null): string {
  if (bytes === null) return "Tidak ada data";
  const rate = mbps === null ? "" : ` · ${mbps.toFixed(2).replace(".", ",")} Mbps`;
  return `${formatBytes(bytes)}${rate}`;
}
