"use client";

import { forwardRef, type ComponentProps } from "react";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { cn } from "@/lib/utils";

/**
 * Select native (bukan Base UI) — dipakai form server-action.
 * Modern memakai gaya select default shadcn: border 1px input, rounded-lg,
 * h-8, font sans, tanpa hard shadow.
 */
const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(function Select(
  { className, ...props },
  ref
) {
  const modern = useIsModernTheme();
  return (
    <select
      ref={ref}
      className={cn(
        modern
          ? "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          : "h-11 w-full rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm shadow-[2px_2px_0_0_#111111] outline-none transition-shadow focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export { Select };
