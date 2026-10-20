"use client";

/**
 * Error boundary — /dashboard/templates/builder/[id] (Fase 5).
 * Style brutalist (docs/11/13): inline, bukan toast; border-2 + shadow blok.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function TemplateBuilderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT TEMPLATE BUILDER"
      description="Layout atau asset frame tidak dapat dibaca. Pastikan koneksi stabil sebelum memuat ulang."
      error={error}
      reset={reset}
    />
  );
}
