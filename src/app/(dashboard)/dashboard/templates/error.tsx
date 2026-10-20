"use client";

/**
 * Error boundary - /dashboard/templates (lokal + premium marketplace).
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function TemplatesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT TEMPLATE"
      description="Frame lokal dan katalog premium tidak dapat dimuat. Coba lagi; kalau tetap gagal, periksa koneksi Supabase."
      error={error}
      reset={reset}
    />
  );
}
