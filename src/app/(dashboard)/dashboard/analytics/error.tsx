"use client";

/**
 * Error boundary — /dashboard/analytics (Fase 5).
 * Style brutalist (docs/11/13): inline, bukan toast; border-2 + shadow blok.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT ANALITIK"
      description="Chart dan agregasi revenue tidak dapat dihitung. Coba muat ulang atau perkecil rentang tanggal."
      error={error}
      reset={reset}
    />
  );
}
