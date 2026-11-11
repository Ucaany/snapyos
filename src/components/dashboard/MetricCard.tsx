import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatBp } from "@/lib/dashboard-math";

/**
 * MetricCard — kartu metrik dashboard (docs/04 §4.1, docs/11).
 * Neo-Brutalism: border 2px ink, hard shadow, radius 0, angka mono.
 *
 * Hierarki: `size="hero"` = angka terbesar, padding lebih lega, accent
 * opsional, supaya metrik utama tidak terlihat identik dengan pendukung.
 * `deltaBp` (basis point) menampilkan perubahan vs periode sebelumnya.
 */

export function MetricCard({
  label,
  value,
  sub,
  deltaBp,
  deltaLabel,
  accent = false,
  size = "sm",
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Pertumbuhan basis point vs periode sebelumnya (1% = 100 bp). */
  deltaBp?: number;
  /** Konteks delta, default "vs periode sebelumnya". */
  deltaLabel?: string;
  accent?: boolean;
  size?: "sm" | "hero";
  className?: string;
}) {
  const hasDelta = typeof deltaBp === "number" && Number.isFinite(deltaBp);
  const DeltaIcon = !hasDelta
    ? null
    : deltaBp! > 0
      ? ArrowUpRight
      : deltaBp! < 0
        ? ArrowDownRight
        : Minus;
  const deltaTone = !hasDelta
    ? ""
    : deltaBp! > 0
      ? "border-ink bg-accent-3"
      : deltaBp! < 0
        ? "border-ink bg-accent-2"
        : "border-ink/25 bg-muted text-muted-foreground";

  // Hard offset shadow marks metric hierarchy without adding soft elevation to every surface.
  return (
    <div
      data-slot="metric-card"
      className={cn(
        "flex flex-col justify-between gap-3 border-2 border-ink p-3 shadow-[4px_4px_0_0_#111111] lg:p-4",
        accent ? "bg-accent text-ink" : "bg-surface text-ink",
        size === "hero" && "p-4 lg:p-5",
        className
      )}
    >
      <p
        className={cn(
          "font-mono uppercase tracking-[0.1em] text-muted-foreground",
          accent && "text-ink/80",
          size === "hero" ? "text-xs" : "text-[11px]"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-mono font-bold leading-none tracking-tight",
          size === "hero" ? "text-3xl md:text-4xl lg:text-5xl" : "text-lg md:text-xl"
        )}
      >
        {value}
      </p>
      {hasDelta ? (
        <p className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 border-2 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums",
              deltaTone
            )}
            title={deltaLabel ?? "vs periode sebelumnya"}
          >
            {DeltaIcon ? <DeltaIcon className="size-3.5" aria-hidden /> : null}
            {deltaBp! > 0 ? "+" : ""}
            {formatBp(deltaBp!)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            {deltaLabel ?? "vs periode sebelumnya"}
          </span>
        </p>
      ) : null}
      {sub ? (
        <p
          className={cn(
            "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground",
            accent && "text-ink/80"
          )}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
