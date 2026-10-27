import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * PageHeader — satu pola header halaman untuk seluruh dashboard.
 * Eyebrow mono uppercase membawa konteks operasional (role, jumlah, periode),
 * judul display uppercase, deskripsi sans (bukan mono: paragraf panjang harus
 * tetap enak dibaca), meta sebagai baris teknis.
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
  return (
    <header className="space-y-2">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={cn("font-display text-4xl font-black uppercase tracking-tight md:text-5xl")}>
          {title}
        </h1>
        {right}
      </div>
      {description && (
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {meta && (
        <div className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">{meta}</div>
      )}
    </header>
  );
}
