/* SnapyOS Kiosk service worker — installable PWA.
 * Strategi: halaman lain TIDAK pernah cache HTML navigasi (HTML di-render SSR
 * Next per request; cache HTML lama = hydration mismatch + dashboard basi).
 * Pengecualian: navigasi kiosk `/p/*` memakai network-first dengan fallback
 * HTML terakhir, supaya booth tetap bisa boot saat internet mati — batas
 * jujurnya, cache itu hanya ada setelah satu kunjungan online yang sukses.
 *
 * Aset statis memakai stale-while-revalidate, BUKAN cache-first. API/payment/
 * storage selalu network-only — SW tidak menyentuh data sensitif.
 *
 * Kenapa stale-while-revalidate: aset di `public/` punya URL STABIL (tidak
 * content-hashed), jadi cache-first membuat penggantian aset apa pun — ikon,
 * ilustrasi, logo — tidak pernah terlihat di klien yang sudah terpasang,
 * selamanya. Keluaran build Next tetap aman karena URL-nya ber-hash; yang
 * terdampak justru `public/`. SWR menyajikan salinan cache seketika (tetap
 * cepat, tetap jalan offline) lalu memperbarui di latar, sehingga perubahan
 * aset terpakai pada muat berikutnya.
 */
const CACHE = "snapyos-kiosk-v7";
/** Cache navigasi dipisah dari cache aset: umur dan aturan pakainya beda. */
const NAV_CACHE = "snapyos-kiosk-nav-v7";
/** Biner template (thumbnail/frame) — DITULIS KLIEN, SW hanya membaca. */
const FRAME_CACHE = "snapyos-template-assets-v1";
const KIOSK_PATH_PREFIX = "/p/";
const CACHEABLE_DEST = new Set(["image", "font", "style", "script"]);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== NAV_CACHE && k !== FRAME_CACHE)
            .map((k) => caches.delete(k))
        )
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
  // Proxy frame ditangani cabang cache-first sendiri di atas (FRAME_CACHE),
  // bukan cache statis.
  if (url.pathname === "/api/v1/public/frame") return false;
  // URL bertanda tangan (foto/GIF R2/S3) — jangan cache, bisa kedaluwarsa.
  if (url.searchParams.has("X-Amz-Signature") || url.searchParams.has("signature")) return false;
  return true;
}

/**
 * Simpan `<script src>` dan `<link rel=stylesheet>` dari HTML kiosk yang baru
 * di-cache. Tanpa ini HTML offline tampil tanpa CSS dan tanpa JS — halaman
 * kosong yang terlihat seperti booth rusak.
 */
async function cacheHtmlAssets(html, baseUrl) {
  const urls = new Set();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) urls.add(match[1]);
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=["']?stylesheet/i.test(match[0])) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(match[0]);
    if (href) urls.add(href[1]);
  }

  const cache = await caches.open(CACHE);
  await Promise.all(
    [...urls].map(async (raw) => {
      let target;
      try {
        target = new URL(raw, baseUrl);
      } catch {
        return;
      }
      if (target.origin !== self.location.origin) return;
      if (await cache.match(target.href)) return;
      try {
        const response = await fetch(target.href);
        if (response.ok) await cache.put(target.href, response);
      } catch {
        /* satu aset gagal tidak membatalkan sisanya */
      }
    })
  );
}

/**
 * Navigasi kiosk: jaringan dulu (HTML selalu segar saat online), HTML terakhir
 * saat jaringan mati. Aset pendukungnya di-cache setelah respons dikirim, jadi
 * pelanggan tidak menunggu unduhan CSS/JS.
 */
function navigateNetworkFirst(event, request) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const forCache = response.clone();
        const forAssets = response.clone();
        event.waitUntil(
          (async () => {
            const cache = await caches.open(NAV_CACHE);
            await cache.put(request, forCache);
            await cacheHtmlAssets(await forAssets.text(), request.url);
          })().catch(() => undefined)
        );
      }
      return response;
    })
    .catch(async () => {
      const cache = await caches.open(NAV_CACHE);
      return (await cache.match(request)) ?? Response.error();
    });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API, Supabase, dan semua non-GET: biarkan jaringan murni.
  if (request.method !== "GET") return;

  // Biner template: cache-first dari FRAME_CACHE (ditulis klien). Key HARUS
  // identik dengan frameCacheUrl() di src/lib/template-cache.ts:
  //   `${origin}/__frame/${encodeURIComponent(cache)}@${w}`
  // `cache` = `${templateId}:${version}` divalidasi ketat; nilai palsu hanya
  // menghasilkan miss, fetch tetap lewat `url` yang divalidasi server.
  if (url.pathname === "/api/v1/public/frame") {
    const cacheKey = url.searchParams.get("cache");
    const valid =
      typeof cacheKey === "string" &&
      cacheKey.length <= 64 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d{1,16}$/.test(cacheKey);
    if (valid) {
      const w = url.searchParams.get("w") ?? "full";
      const key = `${self.location.origin}/__frame/${encodeURIComponent(cacheKey)}@${w}`;
      event.respondWith(
        caches
          .open(FRAME_CACHE)
          .then(async (cache) => {
            const hit = await cache.match(key);
            return hit ?? fetch(request);
          })
          .catch(() => fetch(request))
      );
      return;
    }
  }

  if (url.pathname.startsWith("/api/")) return;
  if (url.hostname.includes("supabase")) return;

  // Navigasi HTML: hanya kiosk `/p/*` yang punya fallback cache. Halaman lain
  // tetap network murni (Next SSR).
  if (request.mode === "navigate") {
    if (!url.pathname.startsWith(KIOSK_PATH_PREFIX)) return;
    event.respondWith(navigateNetworkFirst(event, request));
    return;
  }

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
