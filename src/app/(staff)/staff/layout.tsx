import { redirect } from "next/navigation";

import { StaffSidebar } from "@/components/staff/StaffSidebar";
import { STAFF_NAV } from "@/components/staff/nav";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { CashPaymentNotifier } from "@/components/dashboard/CashPaymentNotifier";
import { EfferdShell } from "@/components/efferd/shell";
import { toEfferdNav } from "@/components/efferd/nav";
import { DashboardThemeProvider } from "@/components/theme/dashboard-theme-context";
import { getDashboardTheme } from "@/lib/dashboard-theme-server";
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
 * Shell brutalist dengan sidebar ramping (5 modul read-only: overview, booth,
 * outlet, package, template). Tema modern mengikuti cookie yang sama.
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

  const theme = await getDashboardTheme();
  if (theme === "modern") {
    return (
      <div className="theme-modern min-h-[100dvh]">
        <DashboardThemeProvider theme="modern">
        <EfferdShell
          navGroups={toEfferdNav([{ label: "Operasional", items: STAFF_NAV }])}
          rootHref="/staff"
          homeHref="/staff"
          user={{ name: user.name, email: user.email }}
          settingsHref="/staff"
        >
          {children}
        </EfferdShell>
        {showCashConfirm && active && <CashPaymentNotifier businessId={active.business.id} />}
        </DashboardThemeProvider>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <DashboardThemeProvider theme="brutalist">
      <StaffTopbar
        user={{ name: user.name, email: user.email }}
        businessName={active?.business.name ?? null}
      />
      <div className="grid w-full flex-1 content-start grid-cols-1 md:content-stretch md:grid-cols-[240px_1fr]">
        <StaffSidebar />
        <main className="min-w-0">{children}</main>
      </div>
      {showCashConfirm && active && <CashPaymentNotifier businessId={active.business.id} />}
      </DashboardThemeProvider>
    </div>
  );
}
