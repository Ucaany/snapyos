"use client";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { cn } from "@/lib/utils";

/**
 * MetricCard — kartu metrik dashboard (docs/04 §4.1, docs/11).
 * Brutalis (default): border 2px ink, hard shadow, radius 0, angka mono.
 * Modern: pola kartu statistik shadcn dashboard-01 — Card ring 1px, label
 * text-sm muted, angka text-2xl font-semibold tabular-nums.
 *
 * Hierarki: `size="hero"` = angka terbesar, padding lebih lega, accent
 * opsional, supaya metrik utama tidak terlihat identik dengan pendukung.
 */

export function MetricCard({
  label,
  value,
  sub,
  accent = false,
  size = "sm",
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  size?: "sm" | "hero";
  className?: string;
}) {
  const modern = useIsModernTheme();

  if (modern) {
    return (
      <div
        data-slot="metric-card"
        className={cn(
          "flex flex-col justify-between gap-1.5 rounded-xl bg-card py-4 text-card-foreground ring-1 ring-foreground/10",
          size === "hero" ? "gap-3 px-6 py-6" : "px-4",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "font-semibold tabular-nums",
            size === "hero" ? "text-3xl @[250px]/card:text-4xl" : "text-2xl"
          )}
        >
          {value}
        </p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    );
  }

  // Hard offset shadow marks metric hierarchy without adding soft elevation to every surface.
  return (
    <div
      data-slot="metric-card"
      className={cn(
        "flex flex-col justify-between gap-3 border-2 border-ink p-4 shadow-[4px_4px_0_0_#111111]",
        accent ? "bg-accent text-ink" : "bg-surface text-ink",
        size === "hero" && "p-5",
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
