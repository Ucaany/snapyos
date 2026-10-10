/**
 * Server-side helper — hitung device online per business (seat).
 * plan camera-sdk §B. Dipakai session-capacity sebagai gate kuota billing.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { countOnline } from "@/lib/device-online";

/** Jumlah device online (seat terpakai) untuk satu business. */
export async function countOnlineDevices(businessId: string): Promise<number> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("devices")
    .select("status, last_seen_at, last_heartbeat_at")
    .eq("business_id", businessId);
  return countOnline((data ?? []) as { status: string; last_seen_at: string | null; last_heartbeat_at?: string | null }[]);
}
