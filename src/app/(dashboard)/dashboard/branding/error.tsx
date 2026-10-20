"use client";

/**
 * Error boundary - /dashboard/branding (kiosk customization).
 * Konfigurasi setengah termuat bisa membuat kiosk tampil salah, jadi
 * pesannya menahan owner dari menyimpan perubahan.
 */

import { FeatureError } from "@/components/dashboard/FeatureError";

export default function BrandingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT BRANDING"
      description="Konfigurasi tampilan kiosk tidak dapat dimuat. Jangan simpan perubahan sebelum halaman tampil normal, agar kiosk tidak berubah setengah jalan. Coba lagi."
      error={error}
      reset={reset}
    />
  );
}
