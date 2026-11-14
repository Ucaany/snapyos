import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/admin/ui/empty";

export type EmptyStateIcon = React.ComponentType<{ className?: string }>;

/**
 * Empty state admin berbasis shadcn `Empty`. API sama dengan komponen lama.
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
    <Empty className="border border-dashed">
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{heading}</EmptyTitle>
        {children ? <EmptyDescription>{children}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
