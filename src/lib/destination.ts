import "server-only";

import { redirect } from "next/navigation";

import type { Membership } from "@/lib/tenant";

/**
 * Post-auth destination (docs/04 §4 onboarding, role-based dashboard).
 * Aturan:
 * - Tanpa membership → /welcome (pemilih: buat bisnis atau tunggu undangan staff)
 * - Hanya role `staff` di semua membership → /staff (operational shell)
 * - Memiliki owner/manager pada membership manapun → /dashboard
 * - Admin platform tetap di-handle di layer auth-action (→ /admin).
 */
export function destinationFor(memberships: readonly Membership[]): string {
  if (memberships.length === 0) return "/welcome";
  const onlyStaff = memberships.every((m) => m.role === "staff");
  if (onlyStaff) return "/staff";
  return "/dashboard";
}

/** Convenience: redirect langsung bila destination sudah final. */
export async function redirectForDestination(
  memberships: readonly Membership[]
): Promise<never> {
  redirect(destinationFor(memberships));
}
