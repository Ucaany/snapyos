"use client";

import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/admin/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/admin/ui/sidebar";
import { isNavActive } from "@/lib/nav-active";
import type { AdminNavIcon } from "./nav-data";

type NavItem = {
  title: string;
  url: string;
  icon: AdminNavIcon;
  isActive?: boolean;
  items?: {
    title: string;
    url: string;
  }[];
};

function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  // Controlled: Base UI warns when `defaultOpen` changes after mount. The
  // parent remounts this group when its active state flips, so the initial
  // value always matches the current route without a setState effect.
  const [open, setOpen] = useState(Boolean(item.isActive));

  return (
    <Collapsible open={open} onOpenChange={(next) => setOpen(next)} render={<SidebarMenuItem />}>
      <SidebarMenuButton
        tooltip={item.title}
        isActive={item.isActive}
        render={<Link href={item.url} />}
      >
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
      {item.items?.length ? (
        <>
          <CollapsibleTrigger render={<SidebarMenuAction className="aria-expanded:rotate-90" />}>
            <ChevronRightIcon />
            <span className="sr-only">Buka {item.title}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.items.map((subItem) => {
                let active = isNavActive(pathname, subItem.url, "/admin");
                if (active) {
                  const moreSpecific = item.items!.some(
                    (other) =>
                      other.url !== subItem.url &&
                      other.url.startsWith(`${subItem.url}/`) &&
                      isNavActive(pathname, other.url, "/admin")
                  );
                  if (moreSpecific) active = false;
                }
                return (
                  <SidebarMenuSubItem key={subItem.title}>
                    <SidebarMenuSubButton isActive={active} render={<Link href={subItem.url} />}>
                      <span>{subItem.title}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </>
      ) : null}
    </Collapsible>
  );
}

export function NavMain({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <NavGroup
            key={`${item.title}-${item.isActive ? "active" : "idle"}`}
            item={item}
            pathname={pathname}
          />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
