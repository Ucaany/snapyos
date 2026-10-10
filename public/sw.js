/* SnapyOS Kiosk service worker — installable PWA.
 * Strategi: TIDAK pernah cache HTML navigasi (HTML di-render SSR Next per
 * request; cache HTML lama = hydration mismatch + kiosk basi). Hanya aset
 * statis immutable yang cache-first. API/payment/storage selalu network-only
 * — SW tidak menyentuh data sensitif. Offline shell kiosk ditangani app
 * (IndexedDB offline-queue), bukan cache HTML SW.
 */
const CACHE = "snapyos-kiosk-v2";
const CACHEABLE_DEST = new Set(["image", "font", "style", "script"]);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
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
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          }
          return res;
        })
    )
  );
});
