import { redirect } from "next/navigation";

import { StaffSidebar } from "@/components/staff/StaffSidebar";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { CashPaymentNotifier } from "@/components/dashboard/CashPaymentNotifier";
import { destinationFor } from "@/lib/destination";
import { can } from "@/lib/rbac";
import { getActiveBusiness, getUserMemberships, requireUser } from "@/lib/tenant";
import { hasFeature } from "@/server/feature-gate";

/**
 * Layout /staff, operasional shell khusus role staff (docs/04 §4.13).
 *
 * - Tanpa user → /login (docs/03 §3.3.1).
 * - Tanpa membership → /welcome (pemilih peran).
 * - Owner/manager di bisnis manapun → /dashboard (shell finansial).
 *
 * Shell brutalist dengan sidebar ramping (4 modul read-only: booth, outlet,
 * package, template). Topbar tanpa workspace switcher (staff cukup 1 bisnis
 * aktif).
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const memberships = await getUserMemberships(user.id);
  const dest = destinationFor(memberships);
  if (dest !== "/staff") redirect(dest);

  const active = await getActiveBusiness(user.id);

  const showCashConfirm = Boolean(
    active &&
      can(active.role, "payment:confirm") &&
      (await hasFeature(active.business.id, "cash_payment"))
  );

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <StaffTopbar
        user={{ name: user.name, email: user.email }}
        businessName={active?.business.name ?? null}
      />
      <div className="grid w-full flex-1 grid-cols-1 md:grid-cols-[240px_1fr]">
        <StaffSidebar />
        <main className="min-w-0">{children}</main>
      </div>
      {showCashConfirm && active && <CashPaymentNotifier businessId={active.business.id} />}
    </div>
  );
}
