import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Panel fitur terkunci plan — dipakai halaman yang mengecek `hasFeature()`
 * sebelum memuat data, dan oleh `FeatureError` saat server melempar
 * FEATURE_DISABLED. Tanpa "use client": aman dirender dari server component.
 */
export function FeatureLockedPanel() {
  return (
    <div className="p-6 md:p-10">
      <div
        role="alert"
        className="flex max-w-xl flex-col items-start gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
      >
        <h1 className="font-display text-2xl uppercase tracking-tight text-ink">
          Fitur belum aktif
        </h1>
        <p className="font-mono text-sm font-bold uppercase tracking-[0.15em] text-destructive">
          FITUR BUTUH UPGRADE
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Fitur ini tidak termasuk dalam plan Anda saat ini. Upgrade subscription untuk membuka
          akses.
        </p>
        <Link
          href="/dashboard/subscription"
          className="inline-flex h-11 items-center gap-2 border-2 border-ink bg-accent px-6 font-mono text-sm font-bold uppercase tracking-[0.08em] shadow-[4px_4px_0_0_#111111] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_#111111] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
        >
          Upgrade Plan
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
