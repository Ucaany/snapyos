import Link from "next/link";
import { Camera, CircleAlert, WifiOff } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import type { BoothHealthItem } from "@/lib/booth-health";
import { cn } from "@/lib/utils";

/**
 * BoothStatusGrid — papan status booth operasional (docs/04 §4.1).
 * Neo-Brutalism: border 2px ink, hard shadow, radius 0, tanpa gradient.
 * Dipakai SEMUA role dashboard (photobox:read), bukan hanya role finansial.
 */
export function BoothStatusGrid({ items }: { items: BoothHealthItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        eyebrow="BELUM ADA BOOTH"
        title="Belum ada photobox terdaftar"
        body="Tambahkan booth agar status heartbeat, template default, dan kesiapan operasional terpantau di sini."
        cta={
          <Button render={<Link href="/dashboard/photoboxes" />} size="sm">
            Ke Halaman Photobox
          </Button>
        }
      />
    );
  }

  return (
    <ul aria-label="Status booth" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((booth) => (
        <li
          key={booth.id}
          className="flex min-w-0 flex-col gap-2 border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_#111111]"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="min-w-0 break-words font-display text-sm font-bold uppercase leading-tight">
                {booth.name}
              </p>
              <p className="mt-1 min-w-0 break-words font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {booth.outletName ?? "Tanpa outlet"}
              </p>
            </div>
            <StatusBadge status={booth.isStale ? "offline" : booth.status} />
          </div>

          <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink/20 bg-ink/20">
            <div className="flex flex-col gap-0.5 bg-surface p-2">
              <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Heartbeat
              </dt>
              <dd
                className={cn(
                  "font-mono text-[11px] font-bold leading-tight tabular-nums",
                  booth.isStale && "text-destructive"
                )}
              >
                {booth.offlineMinutes === null
                  ? "BELUM ADA"
                  : booth.offlineMinutes < 1
                    ? "BARU SAJA"
                    : `${booth.offlineMinutes} MENIT LALU`}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 bg-surface p-2">
              <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Template default
              </dt>
              <dd
                className={cn(
                  "font-mono text-[11px] font-bold leading-tight",
                  booth.needsDefaultTemplate && "text-destructive"
                )}
              >
                {booth.needsDefaultTemplate ? "BELUM DI-SET" : "TERPASANG"}
              </dd>
            </div>
          </dl>

          {booth.isStale && (
            <p className="flex items-center gap-1.5 border-2 border-destructive bg-destructive/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]">
              <WifiOff className="size-3.5 shrink-0" aria-hidden />
              Offline &gt; 10 menit
            </p>
          )}
          {booth.needsDefaultTemplate && (
            <p className="flex items-center gap-1.5 border-2 border-ink/25 bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden />
              Ikut template paket
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
