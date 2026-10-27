"use client";

import { forwardRef, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Select native (bukan Base UI) — dipakai form server-action.
 * Neo-Brutalism: border 2px ink, radius 0, hard shadow 2px.
 */
const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(function Select(
  { className, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-11 w-full rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm shadow-[2px_2px_0_0_#111111] outline-none transition-shadow focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export { Select };
