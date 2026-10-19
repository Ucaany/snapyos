/**
 * Merge `pages` kiosk (jsonb) — murni, tanpa server-only, agar jalur hapus
 * override bisa diuji tanpa database.
 */

type PageConfig = Record<string, unknown>

/**
 * Hapus override visual layar terpilih, sisakan `video_key`.
 *
 * `updateBranding` melakukan deep-merge, jadi layar yang tidak dikirim editor
 * justru mempertahankan nilai lama. Tombol "Reset layar ini" mengirim id layar
 * lewat `resetPages`; tanpa fungsi ini tombol itu terlihat berhasil tetapi
 * kiosk tetap memakai warna/perataan lama. Video punya kontrol hapus sendiri,
 * jadi key-nya dipertahankan.
 */
export function resetPageOverrides(
  pages: Record<string, PageConfig>,
  resetPages: readonly string[]
): Record<string, PageConfig> {
  if (resetPages.length === 0) return pages
  const next: Record<string, PageConfig> = { ...pages }
  for (const key of resetPages) {
    const videoKey = next[key]?.video_key
    if (videoKey) next[key] = { video_key: videoKey }
    else delete next[key]
  }
  return next
}
