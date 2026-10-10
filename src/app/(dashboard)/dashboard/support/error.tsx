"use client"

/**
 * Error boundary - /dashboard/support (tiket bantuan).
 * Menahan owner dari mengira tiketnya hilang: bedakan gagal-muat.
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function SupportError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT TIKET"
      description="Daftar tiket bantuan tidak dapat diambil. Tiket yang sudah terkirim tetap tersimpan; ini hanya gagal menampilkannya. Coba lagi."
      error={error}
      reset={reset}
    />
  )
}
