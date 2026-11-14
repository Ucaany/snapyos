import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AdminStat = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
};

/**
 * Daftar statistik di dalam Card. Memakai garis atas per item, bukan kotak
 * berbingkai, supaya tidak ada kartu di dalam kartu.
 */
export function AdminStatGrid({
  items,
  columns = 4,
  className,
}: {
  items: AdminStat[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-2 sm:grid-cols-3",
        columns === 4 && "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex min-w-0 flex-col gap-1.5 border-t pt-3">
          <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 text-sm font-medium break-words tabular-nums">{item.value}</dd>
          {item.hint ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
