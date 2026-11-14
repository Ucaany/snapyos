import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/admin/ui/card";
import { cn } from "@/lib/utils";

/**
 * Kartu ringkas untuk tampilan grid daftar admin. Berbasis shadcn Card.
 */
export function AdminRecordCard({
  title,
  subtitle,
  badge,
  meta,
  actions,
  footer,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  meta?: Array<{ label: string; value: ReactNode }>;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="min-w-0 break-words text-sm font-medium leading-tight">{title}</p>
            {subtitle ? (
              <p className="mt-1 min-w-0 break-words text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>

        {meta && meta.length > 0 ? (
          <dl className="grid grid-cols-2 gap-2">
            {meta.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
                <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
                <dd className="min-w-0 break-words text-xs font-medium tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {footer ? <div className="min-w-0">{footer}</div> : null}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
