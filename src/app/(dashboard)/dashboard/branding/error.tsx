"use client";

/**
 * Error boundary /dashboard/branding (Design Builder).
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
