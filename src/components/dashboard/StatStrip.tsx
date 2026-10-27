"use client";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { cn } from "@/lib/utils";

/**
 * StatStrip — deretan metrik ringkas.
 * Brutalis (default): grid "blueprint" gap 2px dengan latar ink sebagai garis.
 * Modern: grid kartu shadcn (ring 1px, rounded-xl, label muted, angka
 * tabular-nums) — pola SectionCards di dashboard-01.
 */
export function StatStrip({
  items,
  columns = 4,
  label,
}: {
  items: { label: string; value: string; tone?: string }[];
  columns?: 4 | 6 | 8;
  label: string;
}) {
  const modern = useIsModernTheme();

  if (modern) {
    return (
      <dl
        aria-label={label}
        className={cn(
          "grid grid-cols-2 gap-3",
          columns === 4 && "md:grid-cols-4",
          columns === 6 && "sm:grid-cols-3 lg:grid-cols-6",
          columns === 8 && "md:grid-cols-4 xl:grid-cols-8"
        )}
      >
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-1 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
          >
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink shadow-[4px_4px_0_0_#111111]",
        columns === 4 && "md:grid-cols-4",
        columns === 6 && "sm:grid-cols-3 lg:grid-cols-6",
        columns === 8 && "md:grid-cols-4 xl:grid-cols-8"
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-2 bg-surface p-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </dt>
          <dd
            className={cn(
              "font-mono text-sm font-bold leading-none md:text-base",
              item.tone
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
