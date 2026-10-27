"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { NavGroup } from "@/components/efferd/nav-group";
import type { SidebarNavGroup } from "@/components/efferd/app-shared";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * Sidebar tema modern (block @efferd/app-shell-3): inset + collapsible icon.
 * Nav datang dari pemanggil (owner/admin/staff), bukan daftar demo.
 */
export function AppSidebar({
  navGroups,
  homeHref,
  rootHref,
  footerSlot,
  workspaceSlot,
}: {
  navGroups: SidebarNavGroup[];
  homeHref: string;
  rootHref: string;
  footerSlot?: ReactNode;
  workspaceSlot?: ReactNode;
}) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 justify-center">
        <SidebarMenuButton
          render={<Link href={homeHref} />}
          tooltip="SnapyOS"
          className="gap-2"
        >
          <img src="/snapyos-mark.png" alt="" className="size-6 shrink-0" />
          <span className="font-semibold">SnapyOS</span>
        </SidebarMenuButton>
        {workspaceSlot}
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, index) => (
          <NavGroup key={`${group.label ?? "group"}-${index}`} {...group} rootHref={rootHref} />
        ))}
      </SidebarContent>
      {footerSlot ? (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>{footerSlot}</SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}
