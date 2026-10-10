"use client"

/**
 * Error boundary - /dashboard/payment (credential gateway owner).
 * Handler credential yang gagal dimuat tidak boleh terlihat seperti
 * "belum ada gateway": itu bisa membuat owner menambah credential ganda.
 */

import { FeatureError } from "@/components/dashboard/FeatureError"

export default function PaymentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FeatureError
      title="GAGAL MEMUAT PAYMENT GATEWAY"
      description="Credential gateway tidak dapat diambil. Status ini bukan berarti belum ada credential yang tersimpan. Coba lagi sebelum mengubah apa pun."
      error={error}
      reset={reset}
    />
  )
}
