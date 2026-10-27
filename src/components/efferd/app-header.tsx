"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AppBreadcrumbs } from "@/components/efferd/app-breadcrumbs";
import type { SidebarNavGroup } from "@/components/efferd/app-shared";
import { NavUser } from "@/components/efferd/nav-user";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { Separator } from "@/components/ui/separator";
import { isNavActive } from "@/lib/nav-active";

/**
 * Header tema modern (block @efferd/app-shell-3). Breadcrumb diambil dari
 * nav nyata; slot kanan diisi pemanggil (storage indicator, dsb.).
 */
export function AppHeader({
  navGroups,
  rootHref,
  user,
  isAdmin = false,
  settingsHref = "/dashboard/settings",
  actions,
}: {
  navGroups: SidebarNavGroup[];
  rootHref: string;
  user: { name: string | null | undefined; email: string | null | undefined };
  isAdmin?: boolean;
  settingsHref?: string;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const active = navGroups
    .flatMap((group) => group.items)
    .find((item) => item.path && isNavActive(pathname, item.path, rootHref));

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <CustomSidebarTrigger />
        <Separator className="mr-2 h-4 data-[orientation=vertical]:self-center" orientation="vertical" />
        <AppBreadcrumbs page={active ? { title: active.title, icon: active.icon } : null} />
      </div>
      <div className="flex items-center gap-3">
        {actions}
        {actions ? (
          <Separator className="h-4 data-[orientation=vertical]:self-center" orientation="vertical" />
        ) : null}
        <NavUser user={user} isAdmin={isAdmin} settingsHref={settingsHref} />
      </div>
    </header>
  );
}
