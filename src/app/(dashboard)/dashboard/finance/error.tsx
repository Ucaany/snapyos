"use client";

/**
 * Error boundary — /dashboard/finance (Fase 5).
 * Style brutalist (docs/11/13): inline, bukan toast; border-2 + shadow blok.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function FinanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT FINANSIAL"
      description="Ringkasan revenue, expense, dan saldo tidak tersedia. Cek koneksi Supabase atau muat ulang."
      error={error}
      reset={reset}
    />
  );
}
