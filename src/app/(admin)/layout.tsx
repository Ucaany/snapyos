import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { CollapsibleShell } from "@/components/layout/CollapsibleShell";
import { getSidebarCollapsed } from "@/lib/sidebar-collapse-server";
import { requireUser } from "@/lib/tenant";
import { getAdminUser } from "@/server/admin";

export const metadata: Metadata = {
  title: "Admin Platform - SnapyOS",
};

/**
 * Layout Admin Platform - role=admin / ADMIN_EMAILS (docs/10 §10.5, docs/03 §3.3.4).
 * Shell konsisten dengan layout owner: Topbar + grid 240px/1fr full-width.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();
  if (!admin) {
    const user = await requireUser();
    redirect(user ? "/dashboard" : "/login");
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AdminTopbar user={{ name: admin.name, email: admin.email }} />
      <CollapsibleShell sidebar={<AdminSidebar />} defaultCollapsed={await getSidebarCollapsed()}>
        {children}
      </CollapsibleShell>
    </div>
  );
}
