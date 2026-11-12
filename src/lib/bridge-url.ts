/**
 * URL bridge kamera/printer lokal (Tauri runtime di mesin booth).
 *
 * Nilainya datang dari settings yang bisa ditulis device token, lalu dipakai
 * untuk mengirim foto customer + header X-Bridge-Token. Karena itu tujuannya
 * WAJIB loopback: tanpa batas ini satu PATCH settings membelokkan setiap job
 * cetak (dan token bridge) ke origin milik penyerang.
 *
 * Modul ini sengaja tanpa dependensi agar bisa dipakai validators (server &
 * client) sekaligus cups.ts yang juga dipakai di browser.
 *
 * `resolveBridgeUrl` menormalkan nilai tanpa skema (mis. `127.0.0.1:17777`)
 * menjadi URL absolut, lalu tetap memaksa loopback — menghapus divergensi
 * lama di mana hanya kamera yang menambah skema.
 */

const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
  "0:0:0:0:0:0:0:1",
  "[0:0:0:0:0:0:0:1]",
]);

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:17777";

/** True bila URL adalah http(s) tanpa kredensial ke host loopback. */
export function isLoopbackBridgeUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

/**
 * Resolver bersama kamera + printer. Menambah skema bila hilang, memangkas
 * slash di ujung, dan menolak target non-loopback (fallback ke DEFAULT).
 */
export function resolveBridgeUrl(
  settings?: { bridge_url?: string | null } | null
): string {
  const base = settings?.bridge_url?.trim() || DEFAULT_BRIDGE_URL;
  const withScheme = /^https?:\/\//i.test(base) ? base : `http://${base}`;
  const normalized = withScheme.replace(/\/+$/, "");
  return isLoopbackBridgeUrl(normalized) ? normalized : DEFAULT_BRIDGE_URL;
}

/** Pesan validasi yang dipakai schema settings (camera & print). */
export const LOOPBACK_BRIDGE_URL_MESSAGE =
  "Bridge URL harus http(s) ke 127.0.0.1/localhost (bridge berjalan di mesin booth)";
