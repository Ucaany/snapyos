"use client"

/**
 * Error boundary - /dashboard/transactions.
 * Transaksi = tulang punggung laporan, jadi pesannya mengarah ke pemulihan
 * konkret (rentang tanggal / koneksi), bukan "terjadi kesalahan" generik.
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function TransactionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT TRANSAKSI"
      description="Daftar transaksi tidak dapat diambil. Coba lagi; kalau tetap kosong, perkecil rentang tanggal atau cek koneksi Supabase."
      error={error}
      reset={reset}
    />
  )
}
