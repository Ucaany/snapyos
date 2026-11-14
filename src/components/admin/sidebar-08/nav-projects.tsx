"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderIcon, LayoutGridIcon, MoreHorizontalIcon, ShareIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/admin/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/admin/ui/sidebar";
import { isNavActive } from "@/lib/nav-active";
import type { AdminNavIcon } from "./nav-data";

export function NavProjects({
  projects,
}: {
  projects: {
    name: string;
    url: string;
    icon: AdminNavIcon;
  }[];
}) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();

  const copyLink = (url: string) => {
    void navigator.clipboard?.writeText(`${window.location.origin}${url}`);
  };

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Pintasan</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              isActive={isNavActive(pathname, item.url, "/admin")}
              render={<Link href={item.url} />}
            >
              <item.icon />
              <span>{item.name}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuAction showOnHover className="aria-expanded:bg-muted" />}
              >
                <MoreHorizontalIcon />
                <span className="sr-only">Aksi {item.name}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem render={<Link href={item.url} />}>
                  <FolderIcon className="text-muted-foreground" />
                  <span>Buka</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => copyLink(item.url)}>
                  <ShareIcon className="text-muted-foreground" />
                  <span>Salin tautan</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/admin" />}>
                  <LayoutGridIcon className="text-muted-foreground" />
                  <span>Ringkasan</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton render={<Link href="/admin" />}>
            <LayoutGridIcon />
            <span>Semua modul</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
