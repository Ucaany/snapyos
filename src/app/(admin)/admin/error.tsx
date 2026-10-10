"use client"

/**
 * Error inline admin platform (docs/13 §13.4: error = inline, bukan global).
 * Serupai dengan dashboard error boundary - brutalist, tombol reset.
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT ADMIN"
      description="Terjadi kesalahan saat mengambil data platform. Coba lagi; jika berlanjut, cek koneksi Supabase."
      error={error}
      reset={reset}
    />
  )
}
