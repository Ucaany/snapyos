"use client"

/**
 * Error boundary - /dashboard/photoboxes.
 * Booth = perangkat fisik; pesan mengarah ke tindakan yang bisa dicek
 * di lapangan (status pairing / add-on), bukan cuma "muat ulang".
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function PhotoboxesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT PHOTOBOX"
      description="Daftar booth tidak dapat diambil. Cek status pairing perangkat dan kuota plan, lalu coba lagi."
      error={error}
      reset={reset}
    />
  )
}
