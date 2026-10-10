"use client"

/**
 * Error boundary — /dashboard/pos (Fase 5).
 * Style brutalist (docs/11/13): inline, bukan toast; border-2 + shadow blok.
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function PosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT POS"
      description="Katalog produk atau laporan POS tidak dapat dimuat. Pastikan booth dan add-on POS aktif untuk bisnis ini."
      error={error}
      reset={reset}
    />
  )
}
