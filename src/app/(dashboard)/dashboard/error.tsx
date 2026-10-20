"use client";

/**
 * Error inline dashboard (docs/13 §13.4: error = inline, bukan toast/global).
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT DASHBOARD"
      description="Terjadi kesalahan saat mengambil data. Coba lagi; jika berlanjut, cek koneksi Supabase."
      error={error}
      reset={reset}
    />
  );
}
