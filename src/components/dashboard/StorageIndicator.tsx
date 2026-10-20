"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HardDrive } from "lucide-react";

import { cn } from "@/lib/utils";

type StorageUsage = {
  usedMb: number;
  limitMb: number;
  percent: number;
  isFull: boolean;
};

function fmt(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/**
 * StorageIndicator — indikator kuota storage di topbar (kanan-atas).
 * Fetch on-mount ke endpoint ringan; tidak memblokir SSR. Menampilkan
 * `terpakai / kuota` (GB bila besar) + bar mini. Penuh → aksen pink.
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
          ? `Storage: ${fmt(usage!.usedMb)} / ${fmt(usage!.limitMb)} terpakai (${usage!.percent}%)`
          : "Storage penyimpanan"
      }
      className={cn(
        "hidden min-h-11 shrink-0 items-center gap-2 border-2 border-ink bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-ink transition-colors hover:bg-accent active:translate-y-[2px] sm:flex md:px-3 md:text-xs"
      )}
    >
      <HardDrive className="size-4 shrink-0" />
      {usage === null ? (
        <span className="text-muted-foreground">Storage</span>
      ) : hasLimit ? (
        <span className="flex items-center gap-2">
          <span className={cn(usage.isFull && "font-bold text-destructive")}>
            {fmt(usage.usedMb)}
            <span className="text-muted-foreground"> / {fmt(usage.limitMb)}</span>
          </span>
          <span className="hidden h-3 w-10 border border-ink bg-bg lg:block">
            <span
              className={cn("block h-full", usage.isFull ? "bg-accent-2" : "bg-accent-3")}
              style={{ width: `${usage.percent}%` }}
            />
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">Storage</span>
      )}
    </Link>
  );
}
