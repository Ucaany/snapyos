import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Judul section halaman admin: judul kecil + garis bawah, dengan slot aksi
 * (filter/toggle) di kanan. Dipakai Ringkasan dan halaman Tenant supaya
 * hierarki section seragam.
 */
export function AdminSectionHeading({
  id,
  title,
  description,
  action,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-end justify-between gap-3 border-b pb-3",
        className
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <h2 id={id} className="text-sm font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
