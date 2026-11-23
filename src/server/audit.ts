import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";

/**
 * Audit log terpusat — docs/09 (audit semua aksi finansial/admin),
 * docs/12 Phase 11. Kegagalan tulis tidak membatalkan aksi utama
 * (hanya log console) — audit best-effort, bukan transaksi.
 */
export async function insertAudit(input: {
  actorId: string | null;
  businessId: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: input.actorId,
    business_id: input.businessId,
    action: input.action,
    target: input.target ?? null,
    meta: input.meta ?? {},
  });
  if (error) {
    console.error("[audit] gagal menulis audit_logs:", error.message);
    throw new ApiError("INTERNAL", "Gagal mencatat audit aksi admin");
  }
}
