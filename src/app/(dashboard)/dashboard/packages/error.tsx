"use client"

/**
 * Error boundary - /dashboard/packages.
 * Harga paket menggerakkan checkout, jadi pesannya menegaskan angka
 * yang tampil bukan harga final.
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function PackagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT PAKET"
      description="Daftar paket dan harganya tidak dapat diambil. Jangan ubah harga sebelum halaman ini berhasil dimuat. Coba lagi."
      error={error}
      reset={reset}
    />
  )
}
