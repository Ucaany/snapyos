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
      title="GAGAL MEMUAT APLIKASI BOOTH"
      description="Daftar rilis dan versi booth tidak dapat dimuat. Coba lagi; bila berulang, cek koneksi database."
      error={error}
      reset={reset}
    />
  );
}
