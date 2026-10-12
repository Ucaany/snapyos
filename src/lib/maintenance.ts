/**
 * Maintenance-mode flag reader untuk proxy.
 *
 * PENTING: proxy TIDAK boleh mengandalkan module-level state untuk komunikasi
 * dengan route handler. Next.js docs (middleware/proxy) menyatakan proxy
 * "should not attempt relying on shared modules or globals" — proxy bisa jalan
 * terpisah dari kode render (mis. di CDN). Karena itu flag dibaca LANGSUNG dari
 * DB, tanpa cache lintas-request. Query ini kecil (primary-key lookup) dan hanya
 * dijalankan di jalur yang tidak di-allowlist.
 *
 * Toleran DB error → fail-open (false) supaya site tidak blank karena infra.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";

async function fetchMaintenanceFlag(): Promise<boolean> {
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

/**
 * True bila platform sedang maintenance. Dedup per-request via `cache()` dari
 * React supaya satu request yang memanggil berkali-kali hanya query sekali;
 * TIDAK ada cache lintas-request sehingga toggle admin langsung efektif.
 */
import { cache } from "react";

export const isMaintenanceMode = cache(fetchMaintenanceFlag);

/**
 * Kompatibilitas: desain baru tidak punya cache lintas-request, jadi toggle
 * admin sudah langsung efektif dan tidak ada yang perlu di-invalidate. Export
 * tetap ada agar pemanggil lama (`src/server/admin/gateways.ts`) tidak gagal.
 */
export function invalidateMaintenanceCache(): void {}
