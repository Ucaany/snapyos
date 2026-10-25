"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";

import { StatStrip } from "@/components/dashboard/StatStrip";
import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIDR } from "@/lib/dashboard-math";
import type { TxInsights } from "@/lib/tx-insights";

/**
 * TxInsightsPanel — insights transaksi owner (docs/04 §4.1, docs/11).
 * Semua data real dari transactions (semua status, bukan dummy).
 * Server Component (tanpa interaksi). Bar chart = CSS grid bars
 * (tanpa lib chart — cukup untuk 24 slot histogram).
 */

const STATUS_CELLS: {
  key: "total" | "paid" | "failed" | "pending" | "cancelled" | "refunded";
  label: string;
  tone: string;
}[] = [
  { key: "total", label: "Total Trx", tone: "text-ink" },
  { key: "paid", label: "Berhasil", tone: "text-accent-3-strong" },
  { key: "failed", label: "Gagal", tone: "text-destructive" },
  { key: "pending", label: "Pending", tone: "text-ink" },
  { key: "cancelled", label: "Dibatalkan", tone: "text-muted-foreground" },
  { key: "refunded", label: "Refund", tone: "text-muted-foreground" },
];

function hourLabel(h: number): string {
  return String(h).padStart(2, "0");
}

export function TxInsightsPanel({
  insights,
  rangeLabel,
}: {
  insights: TxInsights;
  rangeLabel: string;
}) {
  const modern = useIsModernTheme();
  const { statusCounts, hourly, peakHour, peakCount, outlets, net } = insights;
  const maxHourly = Math.max(1, ...hourly);

  if (statusCounts.total === 0) {
    return (
      <section aria-labelledby="tx-insights">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <h2 id="tx-insights">{"TX.INSIGHTS"}</h2>
          <span aria-hidden className="h-px flex-1 bg-ink/30" />
          <span>{rangeLabel}</span>
        </div>
        <EmptyState
          icon={Receipt}
          eyebrow="BELUM ADA TRANSAKSI"
          title="Belum ada transaksi"
          body="Ringkasan muncul setelah ada transaksi pertama, baik berhasil, gagal, maupun tertunda, pada periode ini."
          cta={
            <Link
              href="/dashboard/transactions"
              className="border-2 border-ink bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.05em] text-ink shadow-[2px_2px_0_0_#111111] hover:bg-accent active:translate-y-[1px] active:shadow-none"
            >
              Buka halaman transaksi
            </Link>
          }
        />
      </section>
    );
  }

  if (modern) {
    return (
      <section aria-labelledby="tx-insights" className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <h2 id="tx-insights" className="font-medium text-foreground">
            Insight transaksi
          </h2>
          <span>
            {rangeLabel} · NET {formatIDR(net)}
          </span>
        </div>

        <StatStrip
          label="Ringkasan status transaksi"
          columns={6}
          items={STATUS_CELLS.map((cell) => ({
            label: cell.label,
            value: String(statusCounts[cell.key]).padStart(2, "0"),
          }))}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Jam ramai</CardTitle>
              <p className="text-xs text-muted-foreground">
                {peakHour !== null
                  ? `Puncak ${hourLabel(peakHour)}:00–${hourLabel(peakHour)}:59 · ${peakCount} trx`
                  : "Tanpa puncak"}
              </p>
            </CardHeader>
            <CardContent>
              <div
                className="grid h-28 grid-cols-12 items-end gap-1 md:grid-cols-[repeat(24,minmax(0,1fr))]"
                role="img"
                aria-label={`Histogram transaksi per jam, puncak ${peakHour !== null ? hourLabel(peakHour) + ":00" : "-"} dengan ${peakCount} transaksi`}
              >
                {hourly.map((count, h) => (
                  <div
                    key={h}
                    className={h === peakHour ? "bg-chart-2" : count > 0 ? "bg-chart-3" : "bg-muted"}
                    style={{ height: `${Math.max(2, Math.round((count / maxHourly) * 100))}%` }}
                    title={`${hourLabel(h)}:00: ${count} trx`}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Outlet teramai</CardTitle>
              <p className="text-xs text-muted-foreground">{outlets.length} outlet</p>
            </CardHeader>
            <CardContent>
              {outlets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada outlet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-right">Trx</TableHead>
                      <TableHead className="text-right">Gagal</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outlets.map((o) => (
                      <TableRow key={o.outletId}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.count}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          {o.failedCount > 0 ? o.failedCount : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatIDR(o.net)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="tx-insights" className="flex flex-col gap-4">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <h2 id="tx-insights">{"TX.INSIGHTS"}</h2>
        <span aria-hidden className="h-px flex-1 bg-ink/30" />
        <span>
          {rangeLabel} · NET {formatIDR(net)}
        </span>
      </div>

      {/* Bar 1: strip status SEMUA transaksi (grid tipis blueprint). */}
      <StatStrip
        label="Ringkasan status transaksi"
        columns={6}
        items={STATUS_CELLS.map((cell) => ({
          label: cell.label,
          value: String(statusCounts[cell.key]).padStart(2, "0"),
          tone: cell.tone,
        }))}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bar 2: jam ramai: histogram 24 slot CSS. */}
        <div className="border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_0_#111111] md:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {"JAM.RAMAI"}
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {peakHour !== null ? (
                <>
                  PUNCAK{" "}
                  <span className="text-ink">
                    {hourLabel(peakHour)}:00–{hourLabel(peakHour)}:59
                  </span>{" "}
                  · {peakCount} TRX
                </>
              ) : (
                "TANPA PUNCAK"
              )}
            </p>
          </div>
          <div
            className="mt-4 grid h-28 grid-cols-12 items-end gap-[2px] border-2 border-ink bg-bg p-2 md:grid-cols-[repeat(24,minmax(0,1fr))]"
            role="img"
            aria-label={`Histogram transaksi per jam lokal, puncak ${peakHour !== null ? hourLabel(peakHour) + ":00" : "-"} dengan ${peakCount} transaksi`}
          >
            {hourly.map((count, h) => (
              <div
                key={h}
                className={h === peakHour ? "bg-accent" : count > 0 ? "bg-ink/70" : "bg-ink/10"}
                style={{ height: `${Math.max(2, Math.round((count / maxHourly) * 100))}%` }}
                title={`${hourLabel(h)}:00: ${count} trx`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </div>

        {/* Bar 3: outlet teramai (real, sorted by count). */}
        <div className="border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_0_#111111] md:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {"OUTLET.TERAMAI"}
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {outlets.length} OUTLET
            </p>
          </div>
          {outlets.length === 0 ? (
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              {"TIDAK ADA OUTLET"}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-left">
                <caption className="sr-only">Ranking outlet berdasarkan jumlah transaksi</caption>
                <thead>
                  <tr className="border-b-2 border-ink font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-3">
                      Outlet
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      Trx
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      Gagal
                    </th>
                    <th scope="col" className="py-2 text-right">
                      Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {outlets.map((o, i) => (
                    <tr key={o.outletId} className="border-b-2 border-ink/10 font-mono text-xs">
                      <td className="py-2.5 pr-3 font-bold uppercase tracking-[0.05em]">
                        {i === 0 && (
                          <span className="mr-1.5 border-2 border-ink bg-accent px-1.5 py-0.5 text-[10px]">
                            TOP
                          </span>
                        )}
                        {o.name}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-bold">{o.count}</td>
                      <td className="py-2.5 pr-3 text-right text-destructive">
                        {o.failedCount > 0 ? o.failedCount : "-"}
                      </td>
                      <td className="py-2.5 text-right font-bold">{formatIDR(o.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
