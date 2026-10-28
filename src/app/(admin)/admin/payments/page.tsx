import Link from "next/link";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIDR } from "@/lib/dashboard-math";
import { adminPaymentQuerySchema } from "@/lib/validators";
import { getPaymentsSummary, listPayments, adminPosRevenueSummary } from "@/server/admin";

/**
 * Admin payment monitoring - docs/10 §10.3: filter status/provider/tanggal,
 * volume, success/fail/pending/expired/refund, breakdown provider, gross/fee/net.
 *
 * Filter diletakkan di atas ringkasan supaya cakupannya jelas: status/provider
 * hanya menyaring tabel, tanggal menyaring ringkasan sekaligus tabel.
 */

const PAYMENT_STATUSES = ["paid", "pending", "failed", "expired", "cancelled", "refunded"] as const;
// Direct merchant + aggregator: pakasir, midtrans, tripay (docs/06 §6.7).
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
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const hasFilter = Boolean(q.status || q.provider || q.from || q.to);

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="ADMIN - PAYMENT MONITORING"
        title="Monitoring Pembayaran"
        meta={`SEMUA TENANT · ${total} PAYMENT COCOK FILTER`}
      />

      <form method="GET" className="flex flex-wrap items-end gap-3" role="search">
        <BrutalistSelect
          name="status"
          label="Status"
          defaultValue={q.status ?? ""}
          options={[
            { value: "", label: "SEMUA" },
            ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s.toUpperCase() })),
          ]}
        />
        <BrutalistSelect
          name="provider"
          label="Provider"
          defaultValue={q.provider ?? ""}
          options={[
            { value: "", label: "SEMUA" },
            ...PAYMENT_PROVIDERS.map((p) => ({ value: p, label: p.toUpperCase() })),
          ]}
        />
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="f-from" className="font-mono text-[11px] uppercase tracking-[0.12em]">
            Dari
          </label>
          <Input
            id="f-from"
            name="from"
            type="date"
            defaultValue={q.from ?? ""}
            className="w-full sm:w-40"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="f-to" className="font-mono text-[11px] uppercase tracking-[0.12em]">
            Sampai
          </label>
          <Input
            id="f-to"
            name="to"
            type="date"
            defaultValue={q.to ?? ""}
            className="w-full sm:w-40"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Terapkan filter
        </Button>
        {hasFilter ? (
          <Link
            href="/admin/payments"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Hapus filter
          </Link>
        ) : null}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
          <CardDescription>
            {q.from || q.to
              ? `Periode ${q.from ?? "…"} sampai ${q.to ?? "…"}.`
              : "Seluruh waktu."}{" "}
            Angka ringkasan mengikuti filter tanggal saja, bukan status/provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink md:grid-cols-4 xl:grid-cols-6">
            {[
              { label: "Volume Bruto", value: formatIDR(summary.gross) },
              { label: "Biaya Platform", value: formatIDR(summary.fee) },
              { label: "Bersih", value: formatIDR(summary.net) },
              { label: "Dikembalikan", value: formatIDR(summary.refunded) },
              { label: "Lunas", value: String(summary.counts.paid ?? 0) },
              { label: "Menunggu", value: String(summary.counts.pending ?? 0) },
              { label: "Gagal", value: String(summary.counts.failed ?? 0) },
              { label: "Kedaluwarsa", value: String(summary.counts.expired ?? 0) },
              { label: "Dibatalkan", value: String(summary.counts.cancelled ?? 0) },
              {
                label: "Webhook Invalid Sig",
                value: String(summary.webhookIntegrity.invalidSignature),
              },
              { label: "Webhook Error", value: String(summary.webhookIntegrity.errors) },
              { label: "Webhook Total", value: String(summary.webhookIntegrity.total) },
            ].map((cell) => (
              <div key={cell.label} className="flex flex-col gap-1 bg-surface p-3">
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {cell.label}
                </dt>
                <dd className="font-mono text-sm font-bold leading-none">{cell.value}</dd>
              </div>
            ))}
          </dl>
          {summary.byProvider.length > 0 ? (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Provider:{" "}
              {summary.byProvider
                .map((p) => `${p.provider} (${p.count}x · ${formatIDR(p.volume)})`)
                .join(" · ")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bruto / Biaya / Bersih per Tenant</CardTitle>
          <CardDescription>
            Rincian biaya platform dan dana bersih per bisnis, dihitung dari payment lunas sesuai
            policy fee plan aktif.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.byTenant.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              BELUM ADA PAYMENT LUNAS PADA PERIODE INI
            </p>
          ) : (
            <Table containerClassName="shadow-none">
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

      <Card>
        <CardHeader>
          <CardTitle>Pendapatan POS per Tenant</CardTitle>
          <CardDescription>
            Transaksi POS (offline, source of truth transactions), periode sama dengan filter
            tanggal di atas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posRevenue.rows.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              BELUM ADA TRANSAKSI POS
            </p>
          ) : (
            <>
              <p className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.08em]">
                {`TOTAL POS: ${formatIDR(posRevenue.total)}`}
              </p>
              <ul className="flex flex-col gap-2">
                {posRevenue.rows.map((r) => (
                  <li
                    key={r.businessId}
                    className="flex items-center justify-between gap-3 border-2 border-ink bg-surface px-3 py-2"
                  >
                    <span className="text-sm">{r.businessName}</span>
                    <span className="font-mono text-xs">
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

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-6 md:p-8">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
            TIDAK ADA PAYMENT
          </p>
          <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
            Tidak ada payment yang cocok dengan filter saat ini.{" "}
            {hasFilter ? "Hapus filter untuk melihat seluruh riwayat." : ""}
          </p>
          {hasFilter ? (
            <Link
              href="/admin/payments"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Hapus filter
            </Link>
          ) : null}
        </div>
      ) : (
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
                <TableCell className="hidden uppercase lg:table-cell">{p.provider}</TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {dateTimeFmt.format(new Date(p.paid_at ?? p.created_at))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
