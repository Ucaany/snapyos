import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AdminPageHeaderIcon = React.ComponentType<{ className?: string }>;

/**
 * Header halaman admin (shadcn default). Path sudah ditampilkan breadcrumb di
 * `AdminHeader`, jadi komponen ini hanya judul, deskripsi, dan aksi kanan.
 */
export function AdminPageHeader({
  title,
  description,
  meta,
  right,
  size = "page",
  icon: Icon,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  right?: ReactNode;
  size?: "page" | "hero";
  icon?: AdminPageHeaderIcon;
}) {
  return (
    <header className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1
          className={cn(
            "flex min-w-0 items-center gap-2 break-words font-semibold tracking-tight",
            size === "hero" ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"
          )}
        >
          {Icon ? <Icon className="size-6 shrink-0" aria-hidden="true" /> : null}
          <span className="min-w-0 break-words">{title}</span>
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
