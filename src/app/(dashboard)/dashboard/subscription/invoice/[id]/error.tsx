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
      title="GAGAL MEMUAT INVOICE"
      description="Detail tagihan tidak dapat dimuat. Coba lagi; pembayaran yang sudah masuk tetap tercatat."
      error={error}
      reset={reset}
    />
  );
}
