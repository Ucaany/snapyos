import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { BreakdownChart } from "@/components/dashboard/BreakdownChart"
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter"
import { RevenueChart } from "@/components/dashboard/RevenueChart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { can } from "@/lib/rbac"
import { formatIDR } from "@/lib/dashboard-math"
import { getActiveBusiness, requireUser } from "@/lib/tenant"
import { getRevenueSeries } from "@/server/dashboard"
import { getRevenueBreakdown } from "@/server/analytics"

export const metadata: Metadata = {
  title: "Analitik: SnapyOS",
}

const TABS = [
  { key: "day", label: "Per Hari" },
  { key: "outlet", label: "Per Outlet" },
  { key: "package", label: "Per Package" },
  { key: "photobox", label: "Per Photobox" },
  { key: "method", label: "Per Metode Bayar" },
] as const

type TabKey = (typeof TABS)[number]["key"]

/** /dashboard/analytics — revenue analytics + breakdown (docs/04 §4.2). */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string }>
}) {
  const user = await requireUser()
  if (!user) redirect("/login")

  const active = await getActiveBusiness(user.id)
  if (!active) redirect("/dashboard")

  const financialAccess = can(active.role, "transaction:read")
  if (!financialAccess) {
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
    )
  }

  const query = await searchParams
  const range = { from: query.from, to: query.to }
  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "day"
  const businessId = active.business.id

  const [series, breakdown] = await Promise.all([
    getRevenueSeries(user.id, businessId, range),
    tab === "outlet"
      ? getRevenueBreakdown(user.id, businessId, range, "outlet")
      : tab === "package"
        ? getRevenueBreakdown(user.id, businessId, range, "package")
        : tab === "photobox"
          ? getRevenueBreakdown(user.id, businessId, range, "photobox")
          : tab === "method"
            ? getRevenueBreakdown(user.id, businessId, range, "payment_method")
            : Promise.resolve(null),
  ])

  const base = (next: Partial<{ from: string; to: string; tab: string }>) => {
    const params = new URLSearchParams({
      from: query.from ?? series.range.from,
      to: query.to ?? series.range.to,
      tab,
      ...next,
    })
    return `/dashboard/analytics?${params.toString()}`
  }

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="ANALITIK: PENDAPATAN"
        title="Analitik Pendapatan"
        description="Rincian pendapatan (net, setelah diskon) per hari, outlet, paket, photobox, dan metode pembayaran."
        meta={
          tab === "package" ? (
            <span>{"/// termasuk transaksi POS non-paket (bucket tanpa package)"}</span>
          ) : null
        }
        right={
          <DateRangeFilter
            from={series.range.from}
            to={series.range.to}
            timeZone={active.business.timezone || "Asia/Jakarta"}
            basePath="/dashboard/analytics"
          />
        }
      />

      <nav aria-label="Breakdown revenue" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={base({ tab: t.key })}
            aria-current={tab === t.key ? "page" : undefined}
            className={
              tab === t.key
                ? "border-2 border-ink bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] shadow-[2px_2px_0_0_#111111]"
                : "border-2 border-ink bg-surface px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] hover:bg-muted"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{TABS.find((t) => t.key === tab)?.label}</CardTitle>
            <CardDescription>
              {series.range.from} → {series.range.to}
            </CardDescription>
          </div>
          <span className="border-2 border-ink bg-accent px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.1em]">
            Total {formatIDR(tab === "day" ? series.total : (breakdown?.total ?? 0))}
          </span>
        </CardHeader>
        <CardContent>
          {series.total === 0 ? (
            <EmptyState
              eyebrow="BELUM ADA TRANSAKSI PAID"
              title="Belum ada pendapatan"
              body="Belum ada pendapatan pada periode ini. Data muncul setelah customer pertama membayar (QRIS atau dicatat manual)."
            />
          ) : tab === "day" ? (
            <RevenueChart data={series.series} timeZone={active.business.timezone || "Asia/Jakarta"} />
          ) : (
            <BreakdownChart
              data={(breakdown?.items ?? []).map((i) => ({ label: i.label, amount: i.amount }))}
            />
          )}
          {tab !== "day" && (breakdown?.items.length ?? 0) > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left">
                <caption className="sr-only">Rincian breakdown</caption>
                <thead>
                  <tr className="border-b-2 border-ink font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-4">
                      Dimensi
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right">
                      Transaksi
                    </th>
                    <th scope="col" className="py-2 text-right">
                      Pendapatan Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown!.items.map((item) => (
                    <tr key={item.key} className="border-b-2 border-ink/10 font-mono text-xs">
                      <td className="py-2 pr-4 font-bold uppercase">{item.label}</td>
                      <td className="py-2 pr-4 text-right">{item.count}</td>
                      <td className="py-2 text-right font-bold">{formatIDR(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
