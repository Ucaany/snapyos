import { redirect } from "next/navigation";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { buildNavGroups } from "@/components/dashboard/nav";
import { Topbar } from "@/components/dashboard/Topbar";
import { CashPaymentNotifier } from "@/components/dashboard/CashPaymentNotifier";
import { InstallPWA } from "@/components/dashboard/InstallPWA";
import { StorageIndicator } from "@/components/dashboard/StorageIndicator";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import { EfferdShell } from "@/components/efferd/shell";
import { toEfferdNav } from "@/components/efferd/nav";
import { DashboardThemeProvider } from "@/components/theme/dashboard-theme-context";
import { CollapsibleShell } from "@/components/layout/CollapsibleShell";
import { getDashboardTheme } from "@/lib/dashboard-theme-server";
import { destinationFor } from "@/lib/destination";
import { can } from "@/lib/rbac";
import { getSidebarCollapsed } from "@/lib/sidebar-collapse-server";
import { getActiveBusinessForRoles, getUserMemberships, requireUser } from "@/lib/tenant";
import { getAdminUser } from "@/server/admin";
import { hasFeature } from "@/server/feature-gate";
import { hasPosEntitlement } from "@/server/pos-entitlement";

/**
 * Layout Owner Platform — protected (docs/03 §3.3.1).
 * - Tanpa user → /login (docs/12 Phase 1 DoD).
 * - Tanpa membership → /welcome (pemilih peran: owner/staff).
 * - User role staff-only → /staff (operational shell, dipisah).
 * Shell: brutalist single (Neo-Brutalism satu-satunya).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const memberships = await getUserMemberships(user.id);
  const dest = destinationFor(memberships);
  if (dest !== "/dashboard") redirect(dest);

  const dashboardMemberships = memberships.filter(
    (membership) => membership.role === "owner" || membership.role === "manager"
  );
  const active = await getActiveBusinessForRoles(user.id, ["owner", "manager"]);

  // Nav POS hanya jika role berhak + entitlement aktif (R10 — UX, bukan pengaman).
  const showPos = Boolean(
    active && can(active.role, "pos:read") && (await hasPosEntitlement(active.business.id))
  );

  const showCashConfirm = Boolean(
    active &&
    can(active.role, "payment:confirm") &&
    (await hasFeature(active.business.id, "cash_payment"))
  );

  const showPwaKiosk = Boolean(active && (await hasFeature(active.business.id, "pwa_kiosk")));

  const isAdmin = (await getAdminUser()) !== null;

  // Tema shell dipilih per-browser di /dashboard/settings. Brutalis = default.
  const theme = await getDashboardTheme();
  if (theme === "modern") {
    return (
      <div className="theme-modern min-h-[100dvh]">
        <DashboardThemeProvider theme="modern">
        <EfferdShell
          navGroups={toEfferdNav(buildNavGroups(showPos, showPwaKiosk))}
          rootHref="/dashboard"
          homeHref="/dashboard"
          user={{ name: user.name, email: user.email }}
          isAdmin={isAdmin}
          workspaceSlot={
            <WorkspaceSwitcher
              businesses={dashboardMemberships.map((m) => ({
                id: m.business.id,
                name: m.business.name,
              }))}
              activeId={active?.business.id ?? null}
            />
          }
          headerActions={
            active ? (
              <div className="hidden sm:flex">
                <StorageIndicator businessId={active.business.id} />
              </div>
            ) : null
          }
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
      <Topbar
        user={{ name: user.name, email: user.email }}
        businesses={dashboardMemberships.map((m) => ({ id: m.business.id, name: m.business.name }))}
        activeBusiness={active ? { id: active.business.id, name: active.business.name } : null}
        isAdmin={isAdmin}
      />
      <CollapsibleShell
        sidebar={<Sidebar showPos={showPos} showPwaKiosk={showPwaKiosk} />}
        defaultCollapsed={await getSidebarCollapsed()}
      >
        {children}
      </CollapsibleShell>
      {showCashConfirm && active && <CashPaymentNotifier businessId={active.business.id} />}
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-4 md:px-6">
        <InstallPWA />
      </div>
      </DashboardThemeProvider>
    </div>
  );
}
