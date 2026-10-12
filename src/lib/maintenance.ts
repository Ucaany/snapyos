/**
 * Maintenance-mode flag reader untuk proxy.
 *
 * PENTING: proxy TIDAK boleh mengandalkan module-level state untuk komunikasi
 * dengan route handler. Next.js docs (middleware/proxy) menyatakan proxy
 * "should not attempt relying on shared modules or globals" — proxy bisa jalan
 * terpisah dari kode render (mis. di CDN). Karena itu flag dibaca LANGSUNG dari
 * DB setiap request, tanpa cache lintas-request, supaya toggle admin langsung
 * efektif. Query ini kecil (primary-key lookup) dan hanya dijalankan di jalur
 * yang tidak di-allowlist.
 *
 * Toleran DB error → fail-open (false) supaya site tidak blank karena infra.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/** True bila platform sedang maintenance (dibaca fresh dari platform_settings). */
export async function isMaintenanceMode(): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle();
    if (error) return false;
    const v = (data as { value?: unknown } | null)?.value;
    return v === true;
  } catch {
    return false;
  }
}
