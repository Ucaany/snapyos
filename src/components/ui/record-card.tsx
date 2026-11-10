import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * RecordCard - satu bentuk kartu padat untuk tampilan grid pada halaman list.
 * Kartu hanya memuat data ringkas dan aksi satu klik; form edit tetap berada
 * di tampilan daftar agar id input tidak duplikat saat kedua tampilan ter-mount.
 */
export function RecordCard({
  title,
  subtitle,
  badge,
  meta,
  actions,
  footer,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  meta?: Array<{ label: string; value: ReactNode }>;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="record-card"
      className={cn(
        "flex min-w-0 flex-col gap-3 border-2 border-ink bg-surface p-3 shadow-[2px_2px_0_0_#111111]",
        className
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="min-w-0 break-words font-display text-sm font-bold uppercase leading-tight tracking-tight">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 min-w-0 break-words font-mono text-[11px] leading-tight text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>

      {meta && meta.length > 0 ? (
        <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink/20 bg-ink/20">
          {meta.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-0.5 bg-surface p-2">
              <dt className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {item.label}
              </dt>
              <dd className="min-w-0 break-words font-mono text-[11px] font-bold leading-tight tabular-nums">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {footer ? <div className="min-w-0">{footer}</div> : null}

      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
