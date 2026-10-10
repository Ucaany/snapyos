"use client"

/**
 * Error boundary - /dashboard/settings (profil, storage, kebijakan).
 * Kegagalan profile/storage sudah fail-open di server; sisanya menyentuh
 * kebijakan checkout, jadi pesannya menahan owner dari menyimpan blind.
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT PENGATURAN"
      description="Profil bisnis atau kebijakan checkout tidak dapat dimuat. Jangan simpan perubahan sebelum halaman tampil normal. Coba lagi."
      error={error}
      reset={reset}
    />
  )
}
