import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";

import { Card } from "@/components/admin/ui/card";
import { cn } from "@/lib/utils";
import { formatBp } from "@/lib/dashboard-math";

export type AdminMetricTone = "emerald" | "sky" | "amber" | "neutral";

// Tiga hue semantik: emerald uang, sky infrastruktur, amber risiko. Ikon dipilih
// karena maknanya (Wallet uang, Server infra, ShieldCheck integritas).
const toneStyles: Record<AdminMetricTone, string> = {
  emerald:
    "from-emerald-50 text-emerald-600 ring-emerald-600/20 dark:from-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/25",
  sky: "from-sky-50 text-sky-600 ring-sky-600/20 dark:from-sky-500/20 dark:text-sky-300 dark:ring-sky-400/25",
  amber:
    "from-amber-50 text-amber-600 ring-amber-600/20 dark:from-amber-500/20 dark:text-amber-300 dark:ring-amber-400/25",
  neutral: "from-muted text-muted-foreground ring-foreground/5 dark:from-white/10 dark:to-white/5",
};
// Padding dan ukuran label seragam supaya deretan KPI sejajar.
export function AdminMetricCard({
  label,
  value,
  sub,
  deltaBp,
  deltaLabel,
  accent = false,
  size = "sm",
  tone = "neutral",
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  deltaBp?: number;
  deltaLabel?: string;
  accent?: boolean;
  size?: "sm" | "hero";
  tone?: AdminMetricTone;
  icon?: LucideIcon;
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
      ? "text-emerald-600"
      : deltaBp! < 0
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <Card
      className={cn(
        "h-full gap-0 py-0",
        accent && "bg-primary text-primary-foreground",
        className
      )}
    >
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "text-[13px] leading-snug font-medium",
              accent ? "text-primary-foreground/80" : "text-neutral-600 dark:text-neutral-300"
            )}
          >
            {label}
          </p>
          {Icon ? (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                accent
                  ? "bg-primary-foreground/10 ring-primary-foreground/15"
                  : `bg-linear-to-br to-white ${toneStyles[tone]}`
              )}
            >
              <Icon
                className={cn("size-4", accent && "text-primary-foreground/80")}
                aria-hidden="true"
              />
            </span>
          ) : null}
        </div>

        <p
          className={cn(
            "font-semibold leading-none tracking-tight tabular-nums",
            size === "hero" ? "text-3xl md:text-4xl" : "text-2xl"
          )}
        >
          {value}
        </p>

        {hasDelta ? (
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("inline-flex items-center gap-1 tabular-nums", deltaTone)}>
              {DeltaIcon ? <DeltaIcon className="size-3.5" aria-hidden /> : null}
              {deltaBp! > 0 ? "+" : ""}
              {formatBp(deltaBp!)}
            </span>
            <span className={cn(accent ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {deltaLabel ?? "vs periode sebelumnya"}
            </span>
          </p>
        ) : null}

        {sub ? (
          <p
            className={cn(
              "mt-auto text-xs leading-relaxed",
              accent ? "text-primary-foreground/70" : "text-muted-foreground"
            )}
          >
            {sub}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
