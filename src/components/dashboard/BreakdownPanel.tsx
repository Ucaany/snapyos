import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import type { RevenueBreakdown } from "@/server/dashboard";
import { formatIDR } from "@/lib/dashboard-math";

/**
 * BreakdownPanel — breakdown revenue per dimensi (paket, outlet, metode bayar).
 * Sumber: RPC `revenue_breakdown` (GROUP BY di DB). Bar CSS, bukan library chart:
 * tiga panel kecil cukup, dan tidak menambah payload client.
 * Neo-Brutalism: border 2px ink, hard shadow, radius 0, tanpa gradient.
 */

function Dimension({
  title,
  breakdown,
  limit = 5,
}: {
  title: string;
  breakdown: RevenueBreakdown;
  limit?: number;
}) {
  const items = breakdown.items.slice(0, limit);
  const max = Math.max(1, ...items.map((item) => item.amount));

  return (
    <section className="flex min-w-0 flex-col gap-3 border-2 border-ink bg-surface p-3 shadow-hard">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">{title}</h3>
        <span className="font-mono text-[11px] font-bold tabular-nums">
          {formatIDR(breakdown.total)}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="border-2 border-dashed border-ink/30 bg-muted px-2 py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Belum ada transaksi lunas
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-[11px] font-bold uppercase">
                  {item.label}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums">
                  {formatIDR(item.amount)}
                </span>
              </div>
              <div className="h-2 w-full border-2 border-ink bg-bg" aria-hidden>
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.round((item.amount / max) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {item.count} transaksi
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BreakdownPanel({
  breakdowns,
}: {
  breakdowns: {
    package: RevenueBreakdown;
    outlet: RevenueBreakdown;
    paymentMethod: RevenueBreakdown;
  };
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <h2>{"BREAKDOWN REVENUE"}</h2>
        <span aria-hidden className="h-px flex-1 bg-ink/30" />
        <Link
          href="/dashboard/analytics?tab=package"
          className={buttonVariants({
            variant: "link",
            size: "sm",
            className: "h-auto min-h-11 px-2 py-1 text-[10px] uppercase tracking-[0.2em]",
          })}
        >
          Analitik lengkap
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Dimension title="Per Paket" breakdown={breakdowns.package} />
        <Dimension title="Per Outlet" breakdown={breakdowns.outlet} />
        <Dimension title="Per Metode Bayar" breakdown={breakdowns.paymentMethod} />
      </div>
    </div>
  );
}
