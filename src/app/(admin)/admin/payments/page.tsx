import Link from "next/link";
import { Filter, Landmark, Percent, RotateCcw, TrendingUp, Wallet } from "lucide-react";

import { AdminBreakdownChart } from "@/components/admin/AdminCharts";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFilterForm } from "@/components/admin/AdminFilterForm";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { AdminRecordCollection } from "@/components/admin/AdminRecordCollection";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Badge } from "@/components/admin/ui/badge";
import { Button, buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { Progress } from "@/components/admin/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/ui/table";
import { formatIDR } from "@/lib/dashboard-math";
import { adminPaymentQuerySchema } from "@/lib/validators";
import { getPaymentsSummary, listPayments, adminPosRevenueSummary } from "@/server/admin";
import { Label } from "@/components/admin/ui/label";

/**
 * Admin payment monitoring - docs/10 §10.3: filter status/provider/tanggal,
 * volume, success/fail/pending/expired/refund, breakdown provider, gross/fee/net.
 *
 * Filter diletakkan di atas ringkasan supaya cakupannya jelas: status/provider
 * hanya menyaring tabel, tanggal menyaring ringkasan sekaligus tabel.
 */

const PAYMENT_STATUSES = ["paid", "pending", "failed", "expired", "cancelled", "refunded"] as const;
// Direct merchant owner: pakasir, midtrans, tripay (docs/06 §6.7).
const PAYMENT_PROVIDERS = ["pakasir", "midtrans", "tripay"] as const;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    provider?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const raw = await searchParams;
  // Validasi ketat: from/to harus YYYY-MM-DD. Nilai invalid JANGAN diteruskan
  // ke Postgres (bikin 500). Fallback ke filter kosong bila parse gagal.
  const parsed = adminPaymentQuerySchema.safeParse(raw);
  const q = parsed.success ? parsed.data : {};
  const page = q.page ?? 1;
  const [{ items, total }, summary, posRevenue] = await Promise.all([
    listPayments({
      status: q.status,
      provider: q.provider,
      from: q.from,
      to: q.to,
      page,
      limit: 20,
    }),
    getPaymentsSummary({ from: q.from, to: q.to }),
    adminPosRevenueSummary({ from: q.from, to: q.to }),
  ]);

  const dateTimeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
  const numberFormat = new Intl.NumberFormat("id-ID");
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const hasFilter = Boolean(q.status || q.provider || q.from || q.to);

  const paidCount = summary.counts.paid ?? 0;
  const totalPayments = Object.values(summary.counts).reduce((sum, value) => sum + value, 0);
  const successRatio = totalPayments ? (paidCount / totalPayments) * 100 : 0;
  const needsAction = (summary.counts.pending ?? 0) + (summary.counts.failed ?? 0);
  const averageTicket = paidCount > 0 ? Math.round(summary.gross / paidCount) : 0;

  const webhookTotal = summary.webhookIntegrity.total;
  const invalidSignature = summary.webhookIntegrity.invalidSignature;
  const webhookErrors = summary.webhookIntegrity.errors;
  const webhookValid = Math.max(0, webhookTotal - invalidSignature);
  const validPct = webhookTotal ? Math.round((webhookValid / webhookTotal) * 100) : 0;
  const webhookIssues = invalidSignature > 0 || webhookErrors > 0;

  const providerSeries = summary.byProvider.map((provider) => ({
    label: provider.provider.toUpperCase(),
    amount: provider.volume,
  }));

  const paymentStatusRows = [
    {
      key: "paid",
      label: "Lunas",
      value: paidCount,
      color: "var(--chart-2)",
      note: "Dana sudah masuk dan fee platform dihitung.",
      action: "Selesai",
    },
    {
      key: "pending",
      label: "Menunggu",
      value: summary.counts.pending ?? 0,
      color: "var(--chart-4)",
      note: "Invoice dibuat, pembayaran belum dikonfirmasi.",
      action: "Pantau",
    },
    {
      key: "failed",
      label: "Gagal",
      value: summary.counts.failed ?? 0,
      color: "var(--chart-1)",
      note: "Gateway menolak atau signature tidak valid.",
      action: "Cek webhook",
    },
    {
      key: "expired",
      label: "Kedaluwarsa",
      value: summary.counts.expired ?? 0,
      color: "#a3a3a3",
      note: "Melewati batas waktu bayar tanpa settlement.",
      action: "Arsip",
    },
    {
      key: "cancelled",
      label: "Dibatalkan",
      value: summary.counts.cancelled ?? 0,
      color: "#737373",
      note: "Dibatalkan sebelum pembayaran selesai.",
      action: "Arsip",
    },
    {
      key: "refunded",
      label: "Dikembalikan",
      value: summary.counts.refunded ?? 0,
      color: "var(--chart-3)",
      note: "Dana dikembalikan ke pelanggan.",
      action: "Selesai",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Landmark}
        title="Monitoring Pembayaran"
        meta={`Semua tenant · ${total} payment cocok filter`}
      />

      <AdminFilterForm action="/admin/payments" className="flex flex-wrap items-end gap-3">
        <AdminSelect
          name="status"
          label="Status"
          defaultValue={q.status ?? ""}
          options={[
            { value: "", label: "SEMUA" },
            ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s.toUpperCase() })),
          ]}
        />
        <AdminSelect
          name="provider"
          label="Provider"
          defaultValue={q.provider ?? ""}
          options={[
            { value: "", label: "SEMUA" },
            ...PAYMENT_PROVIDERS.map((p) => ({ value: p, label: p.toUpperCase() })),
          ]}
        />
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <Label htmlFor="f-from" className="text-xs font-medium text-muted-foreground">
            Dari
          </Label>
          <Input
            id="f-from"
            name="from"
            type="date"
            defaultValue={q.from ?? ""}
            className="w-full sm:w-40"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <Label htmlFor="f-to" className="text-xs font-medium text-muted-foreground">
            Sampai
          </Label>
          <Input
            id="f-to"
            name="to"
            type="date"
            defaultValue={q.to ?? ""}
            className="w-full sm:w-40"
          />
        </div>
        <Button type="submit" size="sm" variant="outline">
          <Filter className="size-4" aria-hidden="true" />
          Terapkan
        </Button>
        {hasFilter ? (
          <Link
            href="/admin/payments"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Hapus filter
          </Link>
        ) : null}
      </AdminFilterForm>

      <section aria-labelledby="admin-payments-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-payments-metrics"
          title="Ikhtisar"
          description={
            q.from || q.to
              ? `Periode ${q.from ?? "…"} sampai ${q.to ?? "…"} · angka mengikuti filter tanggal.`
              : "Seluruh waktu · angka mengikuti filter tanggal, bukan status/provider."
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={Wallet}
            label="Volume bruto"
            value={formatIDR(summary.gross)}
            sub={`${numberFormat.format(paidCount)} pembayaran lunas`}
          />
          <AdminMetricCard
            tone="amber"
            icon={Percent}
            label="Biaya platform"
            value={formatIDR(summary.fee)}
            sub="Sesuai paket tenant aktif"
          />
          <AdminMetricCard
            tone="sky"
            icon={TrendingUp}
            label="Bersih ke owner"
            value={formatIDR(summary.net)}
            sub="Setelah potongan platform"
          />
          <AdminMetricCard
            tone="amber"
            icon={RotateCcw}
            label="Dikembalikan"
            value={formatIDR(summary.refunded)}
            sub="Payment berstatus refunded"
          />
        </div>
      </section>

      <section aria-labelledby="admin-payments-status" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-payments-status"
          title="Pembayaran"
          description="Komposisi status, volume provider, dan integritas webhook."
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle>Status pembayaran</CardTitle>
              <CardDescription>Komposisi seluruh pembayaran pada periode ini.</CardDescription>
              <CardAction>
                <Badge variant="secondary">{numberFormat.format(totalPayments)} payment</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <ul className="flex flex-col divide-y border-t">
                {paymentStatusRows.map((status) => {
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
              <CardDescription>
                Distribusi volume pembayaran seluruh gateway tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {providerSeries.length ? (
                <AdminBreakdownChart data={providerSeries} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Belum ada data pembayaran untuk ditampilkan.
                </p>
              )}
              {summary.byProvider.length ? (
                <AdminStatGrid
                  items={summary.byProvider.map((provider) => ({
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
              <CardTitle>Bruto, biaya, dan bersih per tenant</CardTitle>
              <CardDescription>
                Rincian biaya platform dan dana bersih per bisnis, dihitung dari payment lunas
                sesuai policy fee plan aktif.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.byTenant.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Belum ada payment lunas pada periode ini.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bisnis</TableHead>
                      <TableHead>Bruto</TableHead>
                      <TableHead className="hidden sm:table-cell">Biaya</TableHead>
                      <TableHead>Bersih</TableHead>
                      <TableHead className="hidden sm:table-cell">Tx</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.byTenant.map((t) => (
                      <TableRow key={t.businessId}>
                        <TableCell className="text-sm">{t.businessName}</TableCell>
                        <TableCell className="font-bold">{formatIDR(t.gross)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{formatIDR(t.fee)}</TableCell>
                        <TableCell className="font-bold">{formatIDR(t.net)}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {t.count}x
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card id="admin-payments-webhook" className="scroll-mt-24 xl:col-span-5">
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

      <section aria-labelledby="admin-payments-pos" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-payments-pos"
          title="POS"
          description="Transaksi POS offline dengan periode filter yang sama."
        />

        <Card>
          <CardHeader>
            <CardTitle>Pendapatan POS per tenant</CardTitle>
            <CardDescription>
              Transaksi POS (offline, source of truth transactions), periode sama dengan filter
              tanggal di atas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {posRevenue.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada transaksi POS.</p>
            ) : (
              <>
                <p className="mb-3 text-xs font-semibold">
                  {`TOTAL POS: ${formatIDR(posRevenue.total)}`}
                </p>
                <ul className="flex flex-col gap-2">
                  {posRevenue.rows.map((r) => (
                    <li
                      key={r.businessId}
                      className="flex items-center justify-between gap-3 border-t py-2 first:border-t-0"
                    >
                      <span className="text-sm">{r.businessName}</span>
                      <span className="text-xs tabular-nums">
                        {formatIDR(r.final)}
                        <span className="ml-2 text-muted-foreground">{r.count}x</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <AdminRecordCollection
        storageKey="snapyos.view.admin.payments"
        label="Daftar pembayaran"
        title="Daftar pembayaran"
        description={`${numberFormat.format(total)} payment cocok filter${hasFilter ? " saat ini" : ""}.`}
        empty={
          items.length === 0 ? (
            <AdminEmptyState
              heading="Tidak ada payment"
              icon={Landmark}
              action={
                hasFilter ? (
                  <Link
                    href="/admin/payments"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Hapus filter
                  </Link>
                ) : null
              }
            >
              Tidak ada payment yang cocok dengan filter saat ini.
              {hasFilter ? " Hapus filter untuk melihat seluruh riwayat." : ""}
            </AdminEmptyState>
          ) : undefined
        }
        list={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead className="hidden md:table-cell">Bisnis</TableHead>
                <TableHead>Nilai</TableHead>
                <TableHead className="hidden lg:table-cell">Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-bold">{p.payment_reference}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{p.business_name}</TableCell>
                  <TableCell className="font-bold">
                    {formatIDR(p.final_amount)}
                    {p.discount_amount > 0 ? (
                      <span className="block text-muted-foreground">
                        diskon {formatIDR(p.discount_amount)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{p.provider}</TableCell>
                  <TableCell>
                    <AdminStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {dateTimeFmt.format(new Date(p.paid_at ?? p.created_at))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
        grid={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => (
              <AdminRecordCard
                key={p.id}
                title={p.payment_reference}
                subtitle={p.business_name}
                badge={<AdminStatusBadge status={p.status} />}
                meta={[
                  { label: "Nilai", value: formatIDR(p.final_amount) },
                  { label: "Provider", value: p.provider.toUpperCase() },
                  {
                    label: "Waktu",
                    value: dateTimeFmt.format(new Date(p.paid_at ?? p.created_at)),
                  },
                  ...(p.discount_amount > 0
                    ? [{ label: "Diskon", value: formatIDR(p.discount_amount) }]
                    : []),
                ]}
              />
            ))}
          </div>
        }
      />

      <AdminPaginator
        basePath="/admin/payments"
        page={page}
        totalPages={totalPages}
        searchParams={{
          status: q.status,
          provider: q.provider,
          from: q.from,
          to: q.to,
        }}
      />
    </div>
  );
}
