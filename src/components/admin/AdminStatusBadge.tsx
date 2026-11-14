import { Badge } from "@/components/admin/ui/badge";
import { cn } from "@/lib/utils";

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

const SUCCESS = new Set([
  "paid",
  "completed",
  "active",
  "online",
  "confirmed",
  "sent",
  "activated",
]);

const WAITING = new Set([
  "pending",
  "scheduled",
  "maintenance",
  "processing",
  "partial",
  "open",
  "needs_action",
  "trial",
  "past_due",
  "sending",
]);

export function AdminStatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const variant =
    status === "failed"
      ? "destructive"
      : SUCCESS.has(status)
        ? "default"
        : WAITING.has(status)
          ? "outline"
          : "secondary";

  return (
    <Badge variant={variant} className={cn("min-h-6", className)}>
      {label ?? LABEL[status] ?? status}
    </Badge>
  );
}
