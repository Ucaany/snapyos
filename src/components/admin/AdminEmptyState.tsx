import type { ReactNode } from "react";

/**
 * Empty state brutalist bersama. Sebelumnya blok `border-2 border-dashed`
 * dengan heading `...` + paragraf diulang di 10+ halaman admin dengan
 * padding dan copy yang sedikit berbeda-beda. Satu komponen, satu bentuk.
 */
export function AdminEmptyState({
  heading,
  children,
  action,
}: {
  heading: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-6 md:p-8">
      <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">{heading}</p>
      {children ? (
        <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">{children}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
