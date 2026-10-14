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
 * Error DB dibedakan dari status disabled agar proxy dapat fail-closed 503.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";

export type MaintenanceState = "enabled" | "disabled" | "unavailable";

/** Status maintenance dibaca fresh dari platform_settings untuk setiap request. */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle();
    if (error) return "unavailable";
    const value = (data as { value?: unknown } | null)?.value;
    return value === true ? "enabled" : "disabled";
  } catch {
    return "unavailable";
  }
}
