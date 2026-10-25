"use client";

import * as React from "react";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { modernTextarea } from "@/components/ui/modern-classes";
import { cn } from "@/lib/utils";

/**
 * Textarea — dua tema. Modern memakai kelas default shadcn base-nova.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const modern = useIsModernTheme();
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        modern
          ? modernTextarea
          : "flex field-sizing-content min-h-16 w-full rounded-none border-2 border-ink bg-surface px-2.5 py-2 text-base text-ink transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
