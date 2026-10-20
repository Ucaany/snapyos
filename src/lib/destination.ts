export type DestinationMembership = { role: "owner" | "manager" | "staff" };

/**
 * Post-auth destination (docs/04 §4 onboarding, role-based dashboard).
 * Aturan:
 * - Tanpa membership → /welcome (pemilih: buat bisnis atau tunggu undangan staff)
 * - Hanya role `staff` di semua membership → /staff (operational shell)
 * - Memiliki owner/manager pada membership manapun → /dashboard
 * - Admin platform diputuskan caller via isAdminUser() → /admin (kontrak sama
 *   dengan requireAdmin/proxy: role DB `admin` ATAU email di ADMIN_EMAILS).
 */
export function destinationFor(memberships: readonly DestinationMembership[]): string {
  if (memberships.length === 0) return "/welcome";
  const onlyStaff = memberships.every((m) => m.role === "staff");
  if (onlyStaff) return "/staff";
  return "/dashboard";
}

/**
 * Tujuan pasca-login. `isAdmin` dihitung caller dengan `isAdminUser()` supaya
 * routing, guard, dan proxy memakai satu kontrak admin yang sama.
 */
export function destinationForUser(
  memberships: readonly DestinationMembership[],
  options: { isAdmin: boolean }
): string {
  if (options.isAdmin) return "/admin";
  return destinationFor(memberships);
}
