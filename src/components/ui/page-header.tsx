import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageHeaderIcon = React.ComponentType<{ className?: string }>;

/**
 * PageHeader — satu pola header halaman untuk seluruh dashboard.
 * Eyebrow mono uppercase membawa konteks operasional (role, jumlah, periode),
 * judul display uppercase, deskripsi sans (bukan mono: paragraf panjang harus
 * tetap enak dibaca), meta sebagai baris teknis.
 *
 * `size` menetapkan satu skala H1 supaya hierarki tidak bergeser saat pindah
 * halaman: "hero" hanya untuk overview, sisanya "page".
 * `icon` opsional menautkan halaman ke ikon nav-nya (Lucide, DESIGN §4).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  right,
  size = "page",
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  right?: ReactNode;
  size?: "page" | "hero";
  icon?: PageHeaderIcon;
}) {
  return (
    <header className="min-w-0 space-y-2">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span className="min-w-0 break-words">{eyebrow}</span>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1
          className={cn(
            "min-w-0 break-words font-display font-black uppercase tracking-tight",
            size === "hero"
              ? "text-3xl sm:text-4xl md:text-5xl"
              : "text-2xl sm:text-3xl md:text-4xl"
          )}
        >
          {title}
        </h1>
        {right}
      </div>
      {description && (
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {meta && (
        <div className="min-w-0 break-words font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {meta}
        </div>
      )}
    </header>
  );
}
