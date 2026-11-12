import type { ReactNode } from "react";

export type EmptyStateIcon = React.ComponentType<{ className?: string }>;

/**
 * Empty state brutalist bersama. Satu komponen, satu bentuk untuk seluruh
 * halaman admin: heading mono uppercase, penjelasan penyebab, aksi mengisi.
 * `icon` opsional menandai jenis entitas yang kosong (Lucide, DESIGN §4).
 */
export function AdminEmptyState({
  heading,
  children,
  action,
  icon: Icon,
}: {
  heading: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: EmptyStateIcon;
}) {
  return (
    <div className="flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-4 md:p-5">
      <div className="flex items-center gap-2">
        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center border-2 border-ink/40 bg-surface">
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
        ) : null}
        <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">{heading}</p>
      </div>
      {children ? (
        <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">{children}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
