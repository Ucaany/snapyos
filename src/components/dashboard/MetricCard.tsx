import { cn } from "@/lib/utils";

/**
 * MetricCard — kartu metrik dashboard (docs/04 §4.1, docs/11).
 * Neo-Brutalism: border 2px ink, hard shadow, radius 0, angka mono.
 * Server Component (tanpa interaksi).
 *
 * Hierarki: `size="hero"` = angka terbesar, padding lebih lega, dan accent
 * opsional, supaya metrik utama tidak terlihat identik dengan metrik
 * pendukung. `size="sm"` = default, satu baris angka.
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
