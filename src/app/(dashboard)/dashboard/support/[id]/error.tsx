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
      title="GAGAL MEMUAT TIKET"
      description="Detail tiket dan balasan tidak dapat dimuat. Coba lagi atau kembali ke daftar tiket."
      error={error}
      reset={reset}
    />
  );
}
