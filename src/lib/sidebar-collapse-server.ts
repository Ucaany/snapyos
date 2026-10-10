import { cookies } from "next/headers";

import { SIDEBAR_COLLAPSE_COOKIE } from "@/lib/sidebar-collapse";

/**
 * Helper server-only: baca cookie ciut/ekspand sidebar di server layout.
 * Dipisah dari `sidebar-collapse.ts` agar konstanta cookie bisa diimpor
 * client component (CollapsibleShell) tanpa menarik `next/headers` ke bundle
 * client — penyebab build error "only available in Server Components".
 */
export async function getSidebarCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(SIDEBAR_COLLAPSE_COOKIE)?.value === "1";
}
