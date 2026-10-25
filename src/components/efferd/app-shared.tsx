import type { ReactNode } from "react";

/** Tipe nav block @efferd/app-shell-3. Data diisi adapter `nav.tsx`. */

export type SidebarNavItem = {
  title: string;
  path?: string;
  icon?: ReactNode;
  isActive?: boolean;
  subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
  label?: string;
  items: SidebarNavItem[];
};
