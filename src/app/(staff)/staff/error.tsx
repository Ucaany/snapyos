"use client"

/**
 * Error inline shell staff (docs/13 §13.4: error = inline, bukan toast/global).
 * Pola sama dengan dashboard/error.tsx owner, sinkron UX lintas shell.
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT HALAMAN STAFF"
      description="Terjadi kesalahan saat mengambil data. Coba lagi; jika berlanjut, cek koneksi Supabase."
      error={error}
      reset={reset}
    />
  )
}
