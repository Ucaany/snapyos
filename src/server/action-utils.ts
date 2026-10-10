"use server";

/**
 * Helper async server actions — pola booth-actions (docs/12).
 * Semua aksi scoped ke business aktif (cookie, divalidasi membership).
 * Helper murni (non-async) ada di @/lib/form-state — file "use server"
 * hanya boleh mengekspor fungsi async.
 */

import { getActiveBusiness, requireUser } from "@/lib/tenant";

export async function requireActiveBusiness() {
  const user = await requireUser();
  if (!user) return null;
  const active = await getActiveBusiness(user.id);
  return active ? { user, businessId: active.business.id, role: active.role } : null;
}
