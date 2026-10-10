"use client"

/**
 * Error boundary - /dashboard/staff.
 * Manajemen tim: pesan menyebut invite/role karena itu aksi utama halaman.
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
      title="GAGAL MEMUAT TIM"
      description="Daftar anggota tim tidak dapat diambil. Perubahan invite dan role tidak diterapkan sampai halaman ini berhasil dimuat. Coba lagi."
      error={error}
      reset={reset}
    />
  )
}
