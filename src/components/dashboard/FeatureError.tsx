"use client"

import Link from "next/link"
import { ArrowRight, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

type FeatureErrorProps = {
  title: string
  description: string
  error: Error & { digest?: string; code?: string; status?: number }
  reset: () => void
}

const FEATURE_DISABLED_RE = /tidak tersedia di plan|butuh upgrade|FEATURE_DISABLED/i

/**
 * Deteksi error entitlemen plan (FEATURE_DISABLED) dari boundary. `.code`
 * tidak selalu selamat serialisasi server→client, jadi fallback ke pesan.
 */
function isFeatureDisabled(error: FeatureErrorProps["error"]): boolean {
  if (error?.code === "FEATURE_DISABLED" || error?.status === 403) return true
  const msg = typeof error?.message === "string" ? error.message : ""
  return FEATURE_DISABLED_RE.test(msg)
}

/** Shared brutalist error panel; route-level error.tsx tetap menjadi boundary. */
export function FeatureError({ title, description, error, reset }: FeatureErrorProps) {
  if (isFeatureDisabled(error)) {
    return (
      <div className="p-6 md:p-10">
        <div
          role="alert"
          className="flex max-w-xl flex-col items-start gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
        >
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em] text-destructive">
            {"/// FITUR BUTUH UPGRADE"}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Fitur ini tidak termasuk dalam plan Anda saat ini. Upgrade subscription
            untuk membuka akses.
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
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div
        role="alert"
        className="flex max-w-xl flex-col items-start gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
      >
        <p className="font-mono text-sm font-bold uppercase tracking-[0.15em] text-destructive">
          {`/// ${title}`}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          {error.digest ? `REF ${error.digest}` : "REF -"}
        </p>
        <Button type="button" onClick={reset}>
          <RotateCcw aria-hidden />
          Coba Lagi
        </Button>
      </div>
    </div>
  )
}
