import { cookies } from "next/headers";

import { DASHBOARD_THEME_COOKIE, parseDashboardTheme, type DashboardTheme } from "@/lib/dashboard-theme";

/**
 * Helper server-only: baca cookie tema shell di layout.
 * Dipisah dari `dashboard-theme.ts` supaya konstanta bisa diimpor client
 * component tanpa menarik `next/headers` ke bundle client.
 */
export async function getDashboardTheme(): Promise<DashboardTheme> {
  const store = await cookies();
  return parseDashboardTheme(store.get(DASHBOARD_THEME_COOKIE)?.value);
}
