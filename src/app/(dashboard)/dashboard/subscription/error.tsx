"use client";

/**
 * Error boundary — /dashboard/subscription (Fase 5).
 * Style brutalist (docs/11/13): inline, bukan toast; border-2 + shadow blok.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function SubscriptionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT LANGGANAN"
      description="Info plan, invoice, dan status subscription tidak dapat diambil. Jika baru membuat invoice, tunggu beberapa detik lalu muat ulang."
      error={error}
      reset={reset}
    />
  );
}
