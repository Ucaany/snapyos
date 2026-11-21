import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * StatusBadge — pemetaan status → accent token, memakai geometri `Badge`
 * supaya hanya ada satu ukuran badge di seluruh aplikasi.
 */

const LABEL: Record<string, string> = {
  paid: "Lunas",
  completed: "Selesai",
  active: "Aktif",
  online: "Online",
  confirmed: "Terkonfirmasi",
  sent: "Terkirim",
  pending: "Menunggu",
  scheduled: "Terjadwal",
  maintenance: "Perawatan",
  processing: "Diproses",
  partial: "Sebagian",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
  inactive: "Nonaktif",
  offline: "Offline",
  refunded: "Refund",
  open: "Terbuka",
  needs_action: "Butuh tindakan",
  resolved: "Selesai",
  trial: "Uji coba",
  past_due: "Tertunggak",
  draft: "Draf",
  sending: "Mengirim",
  activated: "Diaktifkan",
  dismissed: "Diabaikan",
};

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
  failed: "border-destructive bg-destructive text-destructive-foreground",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
  offline: "bg-accent",
  refunded: "bg-accent-4 text-bg",
  open: "bg-accent",
  needs_action: "bg-accent",
  resolved: "bg-muted text-muted-foreground",
  trial: "bg-accent",
  past_due: "bg-accent",
  draft: "bg-muted text-muted-foreground",
  sending: "bg-accent-4 text-bg",
  activated: "bg-accent-3",
  dismissed: "bg-muted text-muted-foreground",
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
      variant="neutral"
      className={cn("min-h-6", STYLE[status] ?? "bg-muted text-muted-foreground", className)}
    >
      {label ?? LABEL[status] ?? status}
    </Badge>
  );
}
