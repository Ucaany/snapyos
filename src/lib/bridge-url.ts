/**
 * URL bridge lokal bersama untuk kamera + printer — MURNI, bisa diuji node.
 *
 * Sebelumnya kamera (`camera-provider.ts`) menambah skema `http://` untuk nilai
 * tanpa skema, sedangkan printer (`print/cups.ts`) tidak. Operator yang mengisi
 * `127.0.0.1:17777` membuat kamera jalan tetapi `fetch` CUPS gagal karena URL
 * relatif. Satu resolver di sini menghapus divergensi itu.
 */

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:17777";

export function resolveBridgeUrl(
  settings?: { bridge_url?: string | null } | null
): string {
  const base = settings?.bridge_url?.trim() || DEFAULT_BRIDGE_URL;
  const withScheme = /^https?:\/\//i.test(base) ? base : `http://${base}`;
  return withScheme.replace(/\/+$/, "");
}
