"use client";

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function DevicesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT PERANGKAT"
      description="Daftar perangkat tidak dapat dimuat. Cek pairing dan koneksi booth, lalu coba lagi."
      error={error}
      reset={reset}
    />
  );
}
