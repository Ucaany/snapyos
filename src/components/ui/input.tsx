"use client";

import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { modernInput } from "@/components/ui/modern-classes";
import { cn } from "@/lib/utils";

/**
 * Input — dua tema. Brutalis (default): border 2px ink, hard shadow.
 * Modern: kelas default shadcn base-nova (h-8, border 1px input, rounded-lg).
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const modern = useIsModernTheme();
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        modern
          ? modernInput
          : "h-11 w-full min-w-0 rounded-none border-2 border-ink bg-surface px-2.5 py-1 text-base text-ink transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Input };
