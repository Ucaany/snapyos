import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * StatusBadge — pemetaan status → accent token, memakai geometri `Badge`
 * supaya hanya ada satu ukuran badge di seluruh aplikasi.
 */

const STYLE: Record<string, string> = {
  paid: "bg-accent-3",
  completed: "bg-accent-3",
  active: "bg-accent-3",
  online: "bg-accent-3",
  confirmed: "bg-accent-3",
  sent: "bg-accent-3",
  pending: "bg-accent",
  scheduled: "bg-accent",
  maintenance: "bg-accent",
  processing: "bg-accent",
  partial: "bg-accent-4 text-bg",
  failed: "bg-accent-2 text-ink",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
  offline: "bg-accent",
  refunded: "bg-accent-4 text-bg",
  open: "bg-accent-3",
  needs_action: "bg-accent",
  resolved: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("min-h-6", STYLE[status] ?? "bg-muted text-muted-foreground", className)}
    >
      {label ?? status}
    </Badge>
  );
}
