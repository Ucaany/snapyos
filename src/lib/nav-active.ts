/**
 * Shared sidebar active-state predicate (Fase 5 — dedup dari 3 sidebar).
 *
 * Aturan:
 * - Root item (`href === rootHref`) hanya aktif saat pathname sama persis;
 *   tanpa ini, `/dashboard` selalu aktif untuk seluruh subroute.
 * - Non-root item aktif saat sama persis atau berada di child segment-nya.
 *
 * Item lintas-shell (mis. link `/docs` di sidebar dashboard) TIDAK
 * ditangani di sini; consumer memfilter secara eksplisit karena setiap
 * shell punya pengecualian berbeda.
 */
export function isNavActive(pathname: string, href: string, rootHref: string): boolean {
  if (href === rootHref) return pathname === rootHref
  return pathname === href || pathname.startsWith(`${href}/`)
}
