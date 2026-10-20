import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/dashboard-math";
import { adminPaymentQuerySchema } from "@/lib/validators";
import { getPaymentsSummary, listPayments, adminPosRevenueSummary } from "@/server/admin";

/**
 * Admin payment monitoring - docs/10 §10.3: filter status/provider/tanggal,
 * volume, success/fail/pending/expired/refund, breakdown provider, gross/fee/net.
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

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"ADMIN - PAYMENT MONITORING"}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
          Monitoring Pembayaran
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          SEMUA TENANT · {total} PAYMENT COCOK FILTER
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
          <CardDescription>
            {q.from || q.to
              ? `Periode ${q.from ?? "…"} → ${q.to ?? "…"}`
              : "Seluruh waktu (filter tanggal di bawah)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink md:grid-cols-4 xl:grid-cols-6">
            {[
              { label: "Gross Volume", value: formatIDR(summary.gross) },
              { label: "Platform Fee", value: formatIDR(summary.fee) },
              { label: "Net", value: formatIDR(summary.net) },
              { label: "Refund", value: formatIDR(summary.refunded) },
              { label: "Paid", value: String(summary.counts.paid ?? 0) },
              { label: "Pending", value: String(summary.counts.pending ?? 0) },
              { label: "Failed", value: String(summary.counts.failed ?? 0) },
              { label: "Expired", value: String(summary.counts.expired ?? 0) },
              { label: "Cancelled", value: String(summary.counts.cancelled ?? 0) },
              {
                label: "Webhook Invalid Sig",
                value: String(summary.webhookIntegrity.invalidSignature),
              },
              { label: "Webhook Error", value: String(summary.webhookIntegrity.errors) },
              { label: "Webhook Total", value: String(summary.webhookIntegrity.total) },
            ].map((cell) => (
              <div key={cell.label} className="flex flex-col gap-1 bg-surface p-3">
                <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
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
          <CardTitle>Gross / Fee / Net per Tenant</CardTitle>
          <CardDescription>
            Rincian platform fee dan net per bisnis (dari payment `paid`, sesuai policy fee plan
            aktif).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.byTenant.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              {"BELUM ADA PAYMENT PAID"}
            </p>
          ) : (
            <div className="overflow-x-auto border-2 border-ink">
              <table className="w-full min-w-[560px] border-collapse bg-surface text-left">
                <thead>
                  <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                    <th className="px-4 py-3 font-bold">Bisnis</th>
                    <th className="px-4 py-3 font-bold">Gross</th>
                    <th className="px-4 py-3 font-bold">Fee</th>
                    <th className="px-4 py-3 font-bold">Net</th>
                    <th className="px-4 py-3 font-bold">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byTenant.map((t) => (
                    <tr key={t.businessId} className="border-t-2 border-ink/10">
                      <td className="px-4 py-3 text-sm">{t.businessName}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold">
                        {formatIDR(t.gross)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{formatIDR(t.fee)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold">{formatIDR(t.net)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {t.count}x
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue POS per Tenant</CardTitle>
          <CardDescription>
            Transaksi POS (offline, source of truth transactions) - sama periode dengan filter di
            bawah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posRevenue.rows.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              {"BELUM ADA TRANSAKSI POS"}
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
        <div className="flex flex-col gap-1">
          <label htmlFor="f-from" className="font-mono text-[10px] uppercase tracking-[0.12em]">
            Dari
          </label>
          <Input id="f-from" name="from" type="date" defaultValue={q.from ?? ""} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-to" className="font-mono text-[10px] uppercase tracking-[0.12em]">
            Sampai
          </label>
          <Input id="f-to" name="to" type="date" defaultValue={q.to ?? ""} className="w-40" />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Filter payment
        </Button>
      </form>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-6 md:p-8">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
            {"TIDAK ADA PAYMENT"}
          </p>
          <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
            Tidak ada payment yang cocok dengan filter saat ini.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[960px] border-collapse bg-surface text-left">
            <thead>
              <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th className="px-4 py-3 font-bold">Reference</th>
                <th className="px-4 py-3 font-bold">Bisnis</th>
                <th className="px-4 py-3 font-bold">Nilai</th>
                <th className="px-4 py-3 font-bold">Provider</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t-2 border-ink/10">
                  <td className="px-4 py-3 font-mono text-xs font-bold">{p.payment_reference}</td>
                  <td className="px-4 py-3 text-sm">{p.business_name}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">
                    {formatIDR(p.final_amount)}
                    {p.discount_amount > 0 ? (
                      <span className="block text-muted-foreground">
                        diskon {formatIDR(p.discount_amount)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs uppercase">{p.provider}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {dateTimeFmt.format(new Date(p.paid_at ?? p.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
