import Link from "next/link";
import { Filter, Landmark } from "lucide-react";

import { AdminDisclosureCard } from "@/components/admin/AdminDisclosureCard";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFilterForm } from "@/components/admin/AdminFilterForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { AdminRecordCollection } from "@/components/admin/AdminRecordCollection";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button, buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
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
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const hasFilter = Boolean(q.status || q.provider || q.from || q.to);

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

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
          <CardDescription>
            {q.from || q.to ? `Periode ${q.from ?? "…"} sampai ${q.to ?? "…"}.` : "Seluruh waktu."}{" "}
            Angka ringkasan mengikuti filter tanggal saja, bukan status/provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AdminStatGrid
            items={[
              { label: "Volume Bruto", value: formatIDR(summary.gross) },
              { label: "Biaya Platform", value: formatIDR(summary.fee) },
              { label: "Bersih", value: formatIDR(summary.net) },
              { label: "Dikembalikan", value: formatIDR(summary.refunded) },
            ]}
          />
          {summary.byProvider.length > 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Provider:{" "}
              {summary.byProvider
                .map((p) => `${p.provider} (${p.count}x · ${formatIDR(p.volume)})`)
                .join(" · ")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <AdminDisclosureCard
        trigger={<span className="text-sm font-medium">Status pembayaran & webhook</span>}
      >
        <AdminStatGrid
          items={[
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
          ]}
        />
      </AdminDisclosureCard>

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

      {items.length === 0 ? (
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
      ) : (
        <AdminRecordCollection
          storageKey="snapyos.view.admin.payments"
          label="Daftar payment"
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
                    <TableCell className="hidden text-sm md:table-cell">
                      {p.business_name}
                    </TableCell>
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
