"use client";

/**
 * Error boundary - /dashboard/reports (export CSV/XLSX).
 * File export yang salah lebih buruk dari tidak ada file, jadi pesannya
 * eksplisit: tidak ada unduhan yang dihasilkan.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT REPORT"
      description="Form export tidak dapat dimuat, jadi tidak ada file yang dihasilkan. Coba lagi."
      error={error}
      reset={reset}
    />
  );
}
