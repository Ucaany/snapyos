"use client";

/**
 * PosReportsPanel — LAPORAN POS (docs/pos/05 §5).
 * Metric grid + tab breakdown (PRODUK/KASIR/OUTLET/BOOTH/HARI) + chart by-day.
 * Tab state di URL (mirror pola /dashboard/analytics) supaya deep-link jalan.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { ChartSkeleton } from "@/components/ui/chart-skeleton";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/dashboard-math";
import type { PosRevenueReport, PosBreakdownRow, PosVsKioskSplit } from "@/lib/pos-reports-math";

const PosReportsDayChart = dynamic(
  () => import("./PosReportsDayChartInner").then((mod) => mod.PosReportsDayChartInner),
  {
    ssr: false,
    loading: () => <ChartSkeleton height="h-[180px]" className="mt-2" />,
  }
);

const TABS = [
  { key: "product", label: "PRODUK" },
  { key: "cashier", label: "KASIR" },
  { key: "outlet", label: "OUTLET" },
  { key: "booth", label: "BOOTH" },
  { key: "day", label: "HARI" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export type PosReportsData = {
  revenue: PosRevenueReport;
  split: PosVsKioskSplit;
  breakdowns: Record<TabKey, PosBreakdownRow[]>;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-2 border-ink bg-surface p-4 shadow-hard-xs">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-lg font-bold leading-none">{value}</span>
    </div>
  );
}

function parseTab(raw: string | null): TabKey {
  return TABS.some((t) => t.key === raw) ? (raw as TabKey) : "product";
}

export function PosReportsPanel({ data, timeZone }: { data: PosReportsData; timeZone?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const { revenue, split, breakdowns } = data;
  const rows = breakdowns[tab];
  const dominant = revenue.byMethod[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Pendapatan POS" value={formatIDR(revenue.totalFinal)} />
        <Metric label="Transaksi" value={String(revenue.count)} />
        <Metric label="Rata-rata" value={formatIDR(revenue.average)} />
        <Metric
          label="Metode dominan"
          value={
            dominant ? `${dominant.key.toUpperCase()} \u00b7 ${formatIDR(dominant.amount)}` : "-"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="border-2 border-ink bg-surface p-4 shadow-hard-xs">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            POS VS KIOSK (LUNAS)
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-3 font-mono text-xs">
            <div>
              <dt className="text-muted-foreground">POS</dt>
              <dd className="font-bold">{formatIDR(split.pos.final)}</dd>
              <dd className="text-muted-foreground">{split.pos.count}x</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">KIOSK</dt>
              <dd className="font-bold">{formatIDR(split.kiosk.final)}</dd>
              <dd className="text-muted-foreground">{split.kiosk.count}x</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">TOTAL</dt>
              <dd className="font-bold">{formatIDR(split.total.final)}</dd>
              <dd className="text-muted-foreground">{split.total.count}x</dd>
            </div>
          </dl>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            {`diskon ${formatIDR(revenue.totalDiscount)} \u00b7 kotor ${formatIDR(revenue.totalGross)}`}
          </p>
        </div>

        {breakdowns.day.length > 0 ? (
          <div className="border-2 border-ink bg-surface p-4 shadow-hard-xs">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              PENDAPATAN POS PER HARI
            </p>
            <PosReportsDayChart
              data={breakdowns.day.map((d) => ({ date: d.label, amount: d.amount }))}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <nav aria-label="Breakdown POS" className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", t.key);
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={`${pathname}?${params.toString()}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: active ? "default" : "neutral", size: "sm" }),
                  "font-mono uppercase tracking-[0.08em]"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <p className="border-2 border-dashed border-ink/40 bg-muted p-6 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {"BELUM ADA DATA PADA RENTANG INI"}
          </p>
        ) : (
          <div className="overflow-x-auto border-2 border-ink bg-surface shadow-hard">
            <table className="w-full md:min-w-[420px] border-collapse text-left">
              <caption className="sr-only">{`Breakdown POS per ${tab}`}</caption>
              <thead>
                <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
                  <th scope="col" className="px-4 py-3">
                    {tab === "product"
                      ? "Produk (snapshot)"
                      : tab === "day"
                        ? "Tanggal"
                        : tab === "cashier"
                          ? "Kasir"
                          : tab === "outlet"
                            ? "Outlet"
                            : "Booth"}
                  </th>
                  {tab === "product" ? (
                    <th scope="col" className="px-4 py-3 text-right">
                      Qty
                    </th>
                  ) : null}
                  <th scope="col" className="px-4 py-3 text-right">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b-2 border-ink/10">
                    <td className="px-4 py-3 font-mono text-xs">
                      {tab === "day"
                        ? new Date(r.label + "T00:00:00Z").toLocaleDateString("id-ID", {
                            timeZone: timeZone || "Asia/Jakarta",
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : r.label}
                    </td>
                    {tab === "product" ? (
                      <td className="px-4 py-3 text-right font-mono text-xs">{r.qty ?? 0}</td>
                    ) : null}
                    <td className="px-4 py-3 text-right font-mono text-sm font-bold">
                      {formatIDR(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
