import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

/**
 * Primitif khusus shell operasional /staff. Bahasa visual datang dari komponen
 * bersama (`ui/card`, `ui/page-header`, `ui/empty-state`, `ui/skeleton`,
 * `ui/button`) supaya staff tidak drift dari owner/admin. Di sini hanya tinggal
 * hal yang benar-benar khas staff: header panel bergaya ink, pasangan
 * label/nilai, dan permukaan kartu daftar.
 */

/** Permukaan kartu daftar (`<li>`) — variant shadow 3px, satu definisi. */
export const STAFF_CARD_SURFACE = "border-2 border-ink bg-surface shadow-[3px_3px_0_0_#111111]";

export function StaffPanel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section {...props}>
      <Card className={cn("gap-0 p-0", className)}>{children}</Card>
    </section>
  );
}

export function StaffPanelHeader({
  label,
  meta,
  className,
}: {
  label: string;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-2 border-ink bg-ink px-4 py-2.5 text-bg",
        className
      )}
    >
      <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">{label}</h2>
      {meta ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-bg/75">{meta}</p>
      ) : null}
    </div>
  );
}

export function StaffPageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} right={aside} />
    </Card>
  );
}

export function StaffMeta({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 min-w-0 font-mono text-xs leading-snug text-ink">{children}</dd>
    </div>
  );
}
