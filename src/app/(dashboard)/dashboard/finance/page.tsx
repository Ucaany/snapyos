import { AccessDeniedPanel } from "@/components/dashboard/AccessDeniedPanel";
import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { ExpensesPanel } from "@/components/dashboard/ExpensesPanel";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { formatBp, formatIDR } from "@/lib/dashboard-math";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getFinanceSummary, listExpenses } from "@/server/finance";
import { listOutlets } from "@/server/outlets";

export const metadata: Metadata = {
  title: "Keuangan: SnapyOS",
};

const CATEGORY_LABEL: Record<string, string> = {
  rent: "Sewa",
  electricity: "Listrik",
  internet: "Internet",
  paper: "Kertas",
  ink: "Tinta",
  maintenance: "Perawatan",
  staff: "Gaji staff",
  equipment: "Peralatan",
  advertising: "Iklan",
  other: "Lainnya",
};

/** /dashboard/finance — income vs expense → estimated profit (docs/04 §4.4). */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (!can(active.role, "finance:read")) {
    return (
      <PageShell>
        <AccessDeniedPanel resource="finance" />
      </PageShell>
    );
  }
  const canWrite = can(active.role, "expense:write");

  const query = await searchParams;
  const range = { from: query.from, to: query.to };
  const businessId = active.business.id;

  const [summary, expenses, outlets] = await Promise.all([
    getFinanceSummary(user.id, businessId, range),
    listExpenses(user.id, businessId, range),
    listOutlets(user.id, businessId),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="KEUANGAN: ESTIMASI LABA"
        title="Keuangan"
        description="Pendapatan dihitung dari transaksi paid (source of truth: transactions); biaya dicatat manual. Bukan software akuntansi. Termasuk transaksi POS (offline) yang tidak mengubah saldo."
        right={
          <DateRangeFilter
            from={summary.range.from}
            to={summary.range.to}
            timeZone={active.business.timezone || "Asia/Jakarta"}
            basePath="/dashboard/finance"
          />
        }
      />

      <section aria-label="Ringkasan finance" className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <MetricCard
          accent
          size="hero"
          className="md:col-span-6"
          label="Estimasi Laba"
          value={formatIDR(summary.profit)}
          sub={`Margin ${formatBp(summary.marginBp)} · bersih - biaya`}
        />
        <div className="grid grid-cols-1 gap-6 md:col-span-6 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
          <MetricCard
            label="Pendapatan Bersih"
            value={formatIDR(summary.net)}
            sub={`Kotor ${formatIDR(summary.gross)} - diskon ${formatIDR(summary.discount)}`}
          />
          <MetricCard
            label="Biaya"
            value={formatIDR(summary.expenses)}
            sub={`${expenses.length} catatan pada periode`}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Biaya per Kategori</CardTitle>
          <CardDescription>
            {summary.range.from} → {summary.range.to}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.expensesByCategory.length === 0 ? (
            <EmptyState
              eyebrow="BELUM ADA PENGELUARAN PADA PERIODE INI"
              title="Belum ada catatan pengeluaran"
            />
          ) : (
            <ul className="divide-y-2 divide-ink/10 border-2 border-ink">
              {summary.expensesByCategory.map((cat) => (
                <li
                  key={cat.category}
                  className="flex items-center justify-between gap-4 px-4 py-3 font-mono text-xs"
                >
                  <span className="font-bold uppercase tracking-[0.05em]">
                    {CATEGORY_LABEL[cat.category] ?? cat.category}
                  </span>
                  <span className="font-bold">{formatIDR(cat.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ExpensesPanel
        expenses={expenses}
        outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        canWrite={canWrite}
      />
    </PageShell>
  );
}
