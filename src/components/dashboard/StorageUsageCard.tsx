import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { StorageUsage } from "@/server/storage-usage";
import { formatStorageMb } from "@/lib/storage-units";

/**
 * StorageUsageCard — sisa kuota storage per account (0053). Server component
 * read-only; saat penuh menampilkan peringatan + CTA upgrade ke halaman
 * subscription (owner membeli add-on storage atau naik plan).
 */
export function StorageUsageCard({ usage }: { usage: StorageUsage }) {
  return (
    <section
      className="border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
      aria-labelledby="storage-usage-heading"
    >
      <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
        <h2 id="storage-usage-heading" className="font-display text-lg uppercase tracking-tight">
          Penyimpanan
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          02 / STORAGE
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              Terpakai / Kuota
            </p>
            <p className="font-display text-2xl uppercase tracking-tight">
              {formatStorageMb(usage.usedMb)}{" "}
              <span className="text-muted-foreground">/ {formatStorageMb(usage.limitMb)}</span>
            </p>
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.1em]">
            Sisa <span className="font-bold">{formatStorageMb(usage.remainingMb)}</span>
          </p>
        </div>

        <div className="h-6 w-full border-2 border-ink bg-bg">
          <div className="h-full bg-accent" style={{ width: `${usage.percent}%` }} />
        </div>
        <p className="font-mono text-xs text-muted-foreground">{usage.percent}% terpakai</p>

        {usage.isFull && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-accent-2 p-4">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
              {"PENYIMPANAN PENUH: upload frame & hasil foto diblokir"}
            </p>
            <Button size="sm" nativeButton={false} render={<Link href="/dashboard/subscription" />}>
              Tambah Penyimpanan
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
