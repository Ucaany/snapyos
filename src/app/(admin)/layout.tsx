import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminFooter } from "@/components/admin/AdminFooter";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AppSidebar } from "@/components/admin/sidebar-08/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/admin/ui/sidebar";
import { Toaster } from "@/components/admin/ui/sonner";
import { getAdminSidebarOpen } from "@/lib/admin-sidebar-state";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/tenant";
import { getAdminUser } from "@/server/admin";

export const metadata: Metadata = {
  title: "Admin Platform - SnapyOS",
};

/**
 * Layout Admin Platform - role=admin / ADMIN_EMAILS (docs/10 §10.5, docs/03 §3.3.4).
 * Shell = block resmi shadcn sidebar-08, tema neutral di-scope ke `/admin`
 * lewat `.admin-theme`. Shell lain tetap Neo-Brutalism.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) {
    const user = await requireUser();
    redirect(user ? "/dashboard" : "/login");
  }

  const sidebarOpen = await getAdminSidebarOpen();
  const themeCookie = (await cookies()).get("admin-theme")?.value;
  const dark = themeCookie === "dark";

  return (
    <div className={cn("admin-theme min-h-svh bg-background text-foreground", dark && "dark")}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar user={{ name: admin.name ?? "Admin", email: admin.email ?? "" }} />
        <SidebarInset>
          <AdminHeader dark={dark} />
          <div className="admin-grid-lines mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 pb-8 pt-0 md:px-6">
            {children}
          </div>
          <AdminFooter />
        </SidebarInset>
        <Toaster position="bottom-right" theme={dark ? "dark" : "light"} />
      </SidebarProvider>
    </div>
  );
}
