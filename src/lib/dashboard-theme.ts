/**
 * Pilihan tema shell dashboard (owner/admin/staff), per-browser lewat cookie.
 * Client-safe: tanpa `next/headers` (reader server ada di dashboard-theme-server.ts).
 *
 * - "brutalist" = tampilan SnapyOS sekarang (default).
 * - "modern"    = app shell @efferd/app-shell-3 + token zinc (theme-modern.css).
 */

export const DASHBOARD_THEME_COOKIE = "snapyos_dashboard_theme";

export type DashboardTheme = "brutalist" | "modern";

/** Nilai tak dikenal (cookie lama/typo) jatuh ke brutalist, bukan modern. */
export function parseDashboardTheme(value?: string | null): DashboardTheme {
  return value === "modern" ? "modern" : "brutalist";
}

/** Tulis pilihan tema ke cookie browser (client-only). */
export function setThemeCookie(theme: DashboardTheme): void {
  document.cookie = `${DASHBOARD_THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}
