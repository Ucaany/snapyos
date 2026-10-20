/* SnapyOS Kiosk service worker — installable PWA.
 * Strategi: TIDAK pernah cache HTML navigasi (HTML di-render SSR Next per
 * request; cache HTML lama = hydration mismatch + kiosk basi). Aset statis
 * memakai stale-while-revalidate, BUKAN cache-first. API/payment/storage selalu
 * network-only — SW tidak menyentuh data sensitif. Offline shell kiosk ditangani
 * app (IndexedDB offline-queue), bukan cache HTML SW.
 *
 * Kenapa stale-while-revalidate: aset di `public/` punya URL STABIL (tidak
 * content-hashed), jadi cache-first membuat penggantian aset apa pun — ikon,
 * ilustrasi, logo — tidak pernah terlihat di klien yang sudah terpasang,
 * selamanya. Keluaran build Next tetap aman karena URL-nya ber-hash; yang
 * terdampak justru `public/`. SWR menyajikan salinan cache seketika (tetap
 * cepat, tetap jalan offline) lalu memperbarui di latar, sehingga perubahan
 * aset terpakai pada muat berikutnya.
 */
const CACHE = "snapyos-kiosk-v5";
const CACHEABLE_DEST = new Set(["image", "font", "style", "script"]);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => undefined)
  );
});

/** Aset aman di-cache? Lewati API, lintas-origin, signed URL, dan HTML. */
function isCacheableStatic(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (request.mode === "navigate") return false;
  if (!CACHEABLE_DEST.has(request.destination)) return false;
  if (url.pathname.startsWith("/api/")) return false;
  // Proxy frame: respons bisa berubah per `?w=` dan per signed URL; jangan
  // disimpan di cache statis (thumbnail bisa basi setelah owner ganti frame).
  if (url.pathname === "/api/v1/public/frame") return false;
  // URL bertanda tangan (foto/GIF R2/S3) — jangan cache, bisa kedaluwarsa.
  if (url.searchParams.has("X-Amz-Signature") || url.searchParams.has("signature")) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API, Supabase, dan semua non-GET: biarkan jaringan murni.
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.hostname.includes("supabase")) return;

  // Navigasi HTML: SELALU network (Next SSR), tanpa cache.
  if (request.mode === "navigate") return;

  if (!isCacheableStatic(request, url)) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      // Revalidasi selalu di latar; hasilnya dipakai pada muat berikutnya.
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(request, copy))
              .catch(() => undefined);
          }
          return res;
        })
        .catch(() => hit ?? Response.error());

      // Salinan cache dipakai untuk tampilan seketika; `network` sudah berjalan
      // di latar dan memperbarui cache untuk muat berikutnya.
      return hit ?? network;
    })
  );
});
