"use client";

/**
 * Error boundary - /dashboard/outlets.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function OutletsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT OUTLET"
      description="Daftar outlet tidak dapat diambil, jadi relasi booth ke outlet tidak lengkap. Coba lagi atau periksa koneksi Supabase."
      error={error}
      reset={reset}
    />
  );
}
