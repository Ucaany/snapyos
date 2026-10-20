"use client";

/**
 * Error boundary - /dashboard/customers.
 * Data pelanggan tidak boleh terlihat "kosong" saat gagal: bedakan
 * error nyata dari empty state agar owner tidak salah kesimpulan.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function CustomersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT PELANGGAN"
      description="Daftar pelanggan tidak dapat diambil. Ini bukan berarti belum ada pelanggan. Coba lagi atau periksa koneksi Supabase."
      error={error}
      reset={reset}
    />
  );
}
