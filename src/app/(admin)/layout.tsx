import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { NAV_GROUPS } from "@/components/admin/nav";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { EfferdShell } from "@/components/efferd/shell";
import { toEfferdNav } from "@/components/efferd/nav";
import { DashboardThemeProvider } from "@/components/theme/dashboard-theme-context";
import { CollapsibleShell } from "@/components/layout/CollapsibleShell";
import { getDashboardTheme } from "@/lib/dashboard-theme-server";
import { getSidebarCollapsed } from "@/lib/sidebar-collapse-server";
import { requireUser } from "@/lib/tenant";
import { getAdminUser } from "@/server/admin";

export const metadata: Metadata = {
  title: "Admin Platform - SnapyOS",
};

/**
 * Layout Admin Platform - role=admin / ADMIN_EMAILS (docs/10 §10.5, docs/03 §3.3.4).
 * Shell konsisten dengan layout owner: Topbar + grid 240px/1fr full-width.
 * Tema mengikuti cookie yang sama (brutalis default, modern = app-shell-3).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) {
    const user = await requireUser();
    redirect(user ? "/dashboard" : "/login");
  }

  const theme = await getDashboardTheme();
  if (theme === "modern") {
    return (
      <div className="theme-modern min-h-[100dvh]">
        <DashboardThemeProvider theme="modern">
        <EfferdShell
          navGroups={toEfferdNav(NAV_GROUPS)}
          rootHref="/admin"
          homeHref="/admin"
          user={{ name: admin.name, email: admin.email }}
          isAdmin
          settingsHref="/admin/settings"
        >
          {children}
        </EfferdShell>
        </DashboardThemeProvider>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <DashboardThemeProvider theme="brutalist">
      <AdminTopbar user={{ name: admin.name, email: admin.email }} />
      <CollapsibleShell sidebar={<AdminSidebar />} defaultCollapsed={await getSidebarCollapsed()}>
        {children}
      </CollapsibleShell>
      </DashboardThemeProvider>
    </div>
  );
}
