const cache = new Set<string>();

/**
 * Prefetch DAFTAR template saja (JSON kecil). Frame penuh tidak diunduh di
 * sini: grid memakai thumbnail, dan `frame-preload.ts` mengambil frame penuh
 * setelah layar interaktif.
 */
export function prefetchTemplatesForPackages(businessSlug: string, packageIds: string[]): void {
  for (const packageId of packageIds) {
    const url = `/api/v1/public/${businessSlug}/templates?package=${encodeURIComponent(packageId)}`;
    if (cache.has(url)) continue;
    cache.add(url);
    void fetch(url, { method: "GET", credentials: "same-origin" }).catch(() => {
      cache.delete(url);
    });
  }
}
