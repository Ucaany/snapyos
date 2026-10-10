import { cn } from "@/lib/utils";

/**
 * StatusBadge — pill status Neo-Brutalist (docs/11 §11.4 Badge).
 * Server component; pemetaan warna status → accent token.
 */

const STYLE: Record<string, string> = {
  paid: "bg-accent-3",
  completed: "bg-accent-3",
  active: "bg-accent-3",
  online: "bg-accent-3",
  confirmed: "bg-accent-3",
  pending: "bg-accent",
  scheduled: "bg-accent",
  maintenance: "bg-accent",
  processing: "bg-accent",
  failed: "bg-accent-2 text-ink",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
  offline: "bg-muted text-muted-foreground",
  refunded: "bg-accent-4 text-bg",
  open: "bg-accent-3",
  needs_action: "bg-accent",
  resolved: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center border-2 border-ink px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]",
        STYLE[status] ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {status}
    </span>
  );
}
