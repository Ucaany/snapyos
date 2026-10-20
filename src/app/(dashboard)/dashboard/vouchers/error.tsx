"use client";

/**
 * Error boundary — /dashboard/vouchers.
 * Fitur voucher di-gate plan (docs/02 §2.7): starter tidak mengaktifkan
 * voucher, sehingga FEATURE_DISABLED ditampilkan sebagai prompt upgrade
 * (bukan error "cek koneksi Supabase" yang menyesatkan).
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function VouchersError({
  error,
  reset,
}: {
  error: Error & { digest?: string; code?: string; status?: number };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT VOUCHER"
      description="Daftar voucher tidak dapat diambil. Coba lagi; jika berlanjut, cek koneksi Supabase."
      error={error}
      reset={reset}
    />
  );
}
