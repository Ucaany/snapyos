"use client";

import type { ReactNode } from "react";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { cn } from "@/lib/utils";

/**
 * PageHeader — dua tema.
 * Brutalis (default): eyebrow mono uppercase, judul display uppercase besar.
 * Modern: pola header halaman shadcn — judul text-2xl font-semibold, deskripsi
 * text-sm muted, tanpa eyebrow mono/uppercase.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  right,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  const modern = useIsModernTheme();

  if (modern) {
    return (
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {right}
        </div>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </header>
    );
  }

  // Shared eyebrow creates one operational dashboard voice and separates context from task title.
  return (
    <header className="space-y-2">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {eyebrow}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1
          className={cn("font-display text-4xl font-black uppercase tracking-tight md:text-5xl")}
        >
          {title}
        </h1>
        {right}
      </div>
      {description && (
        <p className="max-w-[65ch] font-mono text-sm text-muted-foreground">{description}</p>
      )}
      {meta && (
        <div className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {meta}
        </div>
      )}
    </header>
  );
}
