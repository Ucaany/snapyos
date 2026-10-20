"use client";

/**
 * Error boundary - /dashboard/metrics.
 * Angka metrik salah lebih berbahaya dari halaman kosong, jadi pesannya
 * menegaskan data tidak ditampilkan alih-alih menampilkan angka nol.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function MetricsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT METRIK"
      description="Metrik bisnis tidak dapat dihitung dan sengaja tidak ditampilkan sebagian. Coba lagi atau perbesar rentang tanggal."
      error={error}
      reset={reset}
    />
  );
}
