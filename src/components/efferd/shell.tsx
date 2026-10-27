import type { ReactNode } from "react";

import { AppHeader } from "@/components/efferd/app-header";
import { AppSidebar } from "@/components/efferd/app-sidebar";
import type { SidebarNavGroup } from "@/components/efferd/app-shared";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Shell tema modern — struktur block @efferd/app-shell-3 apa adanya:
 * SidebarProvider + sidebar inset collapsible + header sticky + kolom
 * konten scroll internal. Dipasang layout saat cookie tema = "modern".
 */
export function EfferdShell({
  navGroups,
  rootHref,
  homeHref,
  user,
  isAdmin = false,
  settingsHref,
  headerActions,
  sidebarFooter,
  workspaceSlot,
  children,
}: {
  navGroups: SidebarNavGroup[];
  rootHref: string;
  homeHref: string;
  user: { name: string | null | undefined; email: string | null | undefined };
  isAdmin?: boolean;
  settingsHref?: string;
  headerActions?: ReactNode;
  sidebarFooter?: ReactNode;
  workspaceSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden">
      <SidebarProvider className="relative h-svh">
        <AppSidebar
          navGroups={navGroups}
          homeHref={homeHref}
          footerSlot={sidebarFooter}
          workspaceSlot={workspaceSlot}
          rootHref={rootHref}
        />
        <SidebarInset className="md:peer-data-[variant=inset]:ml-0">
          <AppHeader
            navGroups={navGroups}
            rootHref={rootHref}
            user={user}
            isAdmin={isAdmin}
            settingsHref={settingsHref}
            actions={headerActions}
          />
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
