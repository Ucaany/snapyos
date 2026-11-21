"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HardDrive } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { formatStorageMb } from "@/lib/storage-units";

type StorageUsage = {
  usedMb: number;
  limitMb: number;
  percent: number;
  isFull: boolean;
};

/**
 * StorageIndicator — indikator kuota storage di topbar (kanan-atas).
 * Fetch on-mount ke endpoint ringan; tidak memblokir SSR. Menampilkan
 * `terpakai / kuota` dalam MB (spesifikasi produk tidak memakai GB) + bar mini.
 * Penuh → aksen pink.
 * Klik → /dashboard/settings. Hidden di <sm (mobile).
 */
export function StorageIndicator({ businessId }: { businessId: string }) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/business/${businessId}/storage`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json?.data) return;
        setUsage(json.data as StorageUsage);
      })
      .catch(() => {
        if (active) setUsage(null);
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  const hasLimit = usage !== null && usage.limitMb > 0;

  return (
    <Link
      href="/dashboard/settings"
      title={
        hasLimit
          ? `Penyimpanan: ${formatStorageMb(usage!.usedMb)} / ${formatStorageMb(usage!.limitMb)} terpakai (${usage!.percent}%)`
          : "Penyimpanan"
      }
      className={cn(
        buttonVariants({ variant: "neutral", size: "sm" }),
        "hidden shrink-0 gap-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.05em] sm:flex md:px-3 md:text-xs"
      )}
    >
      <HardDrive className="size-4 shrink-0" />
      {usage === null ? (
        <span className="text-muted-foreground">Penyimpanan</span>
      ) : hasLimit ? (
        <span className="flex items-center gap-2">
          <span className={cn(usage.isFull && "font-bold text-destructive")}>
            {formatStorageMb(usage.usedMb)}
            <span className="text-muted-foreground"> / {formatStorageMb(usage.limitMb)}</span>
          </span>
          <span className="hidden h-3 w-10 border border-ink bg-bg lg:block">
            <span
              className={cn("block h-full", usage.isFull ? "bg-accent-2" : "bg-accent-3")}
              style={{ width: `${usage.percent}%` }}
            />
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">Penyimpanan</span>
      )}
    </Link>
  );
}
