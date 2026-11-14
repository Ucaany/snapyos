"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { isNavActive } from "@/lib/nav-active";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/admin/ui/sidebar";
import { NavMain } from "./nav-main";
import { NavProjects } from "./nav-projects";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import { ADMIN_NAV_MAIN, ADMIN_NAV_SECONDARY, ADMIN_NAV_SHORTCUTS } from "./nav-data";

export type AdminSidebarUser = {
  name: string;
  email: string;
};

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: AdminSidebarUser }) {
  const pathname = usePathname();

  const navMain = ADMIN_NAV_MAIN.map((item) => {
    const childActive = item.items?.some((child) => isNavActive(pathname, child.url, "/admin"));
    const selfActive =
      item.url === "/admin" ? pathname === "/admin" : isNavActive(pathname, item.url, "/admin");

    return {
      ...item,
      isActive: Boolean(selfActive || childActive),
    };
  });

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/admin" />}>
              <Image
                src="/snapyos-mark.png"
                alt="Logo SnapyOS"
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">SnapyOS</span>
                <span className="truncate text-xs">Platform Admin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} pathname={pathname} />
        <NavProjects projects={ADMIN_NAV_SHORTCUTS} />
        <NavSecondary items={ADMIN_NAV_SECONDARY} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: user.name, email: user.email, avatar: "" }} />
      </SidebarFooter>
    </Sidebar>
  );
}
