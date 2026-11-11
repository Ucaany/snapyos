import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

import type { DashboardAlert } from "@/lib/dashboard-alerts";
import { cn } from "@/lib/utils";

const TONE_STYLE = {
  danger: "border-destructive bg-destructive/10",
  warning: "border-ink bg-accent",
  info: "border-ink bg-surface",
} as const;

const TONE_ICON = {
  danger: CircleAlert,
  warning: TriangleAlert,
  info: Info,
} as const;

/**
 * AlertStrip — deretan peringatan operasional dashboard (docs/04 §4.1).
 * Neo-Brutalism: border 2px ink, hard shadow, radius 0, tanpa gradient.
 */
export function AlertStrip({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 border-2 border-ink bg-accent-3 px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] shadow-hard-sm"
      >
        <CircleCheck className="size-4 shrink-0" aria-hidden />
        Semua sistem normal, tidak ada peringatan operasional
      </p>
    );
  }

  return (
    <section aria-label="Peringatan operasional" className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {`PERINGATAN OPERASIONAL ${String(alerts.length).padStart(2, "0")}`}
      </p>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {alerts.map((alert) => {
          const Icon = TONE_ICON[alert.tone];
          return (
            <li
              key={alert.key}
              role={alert.tone === "danger" ? "alert" : "status"}
              className={cn(
                "flex min-w-0 items-start gap-3 border-2 p-3 shadow-hard-sm",
                TONE_STYLE[alert.tone]
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
                  {alert.title}
                </p>
                <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                  {alert.detail}
                </p>
                <Link
                  href={alert.href}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] underline underline-offset-4 hover:bg-ink hover:text-bg"
                >
                  Tindak lanjuti
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
