"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SidebarNavGroup } from "@/components/efferd/app-shared";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isNavActive } from "@/lib/nav-active";

/**
 * Grup nav tema modern. Grup SnapyOS datar (tanpa submenu), jadi versi
 * collapsible dari block tidak dipakai. `rootHref` menentukan aturan aktif
 * (root hanya cocok persis) lewat predicate bersama `isNavActive`.
 */
export function NavGroup({ label, items, rootHref }: SidebarNavGroup & { rootHref?: string }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const href = item.path ?? "#";
          const active = rootHref ? isNavActive(pathname, href, rootHref) : false;
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                isActive={active}
                tooltip={item.title}
                render={<Link href={href} aria-current={active ? "page" : undefined} />}
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
