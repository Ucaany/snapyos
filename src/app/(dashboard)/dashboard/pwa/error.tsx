"use client";

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT PANDUAN PWA"
      description="Panduan pemasangan aplikasi tidak dapat dimuat. Coba lagi."
      error={error}
      reset={reset}
    />
  );
}
