import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AdminPageHeaderIcon = React.ComponentType<{ className?: string }>;

/**
 * Header halaman admin (shadcn default). Breadcrumb sudah ada di
 * `AdminHeader`; komponen ini hanya judul, deskripsi, dan aksi kanan.
 */
export function AdminPageHeader({
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
  icon?: AdminPageHeaderIcon;
}) {
  return (
    <header className="min-w-0 space-y-1.5">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span className="min-w-0 break-words">{eyebrow}</span>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1
          className={cn(
            "min-w-0 break-words font-semibold tracking-tight",
            size === "hero" ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"
          )}
        >
          {title}
        </h1>
        {right}
      </div>
      {description && (
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {meta && <div className="min-w-0 break-words text-xs text-muted-foreground">{meta}</div>}
    </header>
  );
}
