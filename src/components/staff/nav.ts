import { Camera, Gauge, ImageIcon, Package, Store } from "lucide-react";

/**
 * Nav shell staff (read-only, docs/04 §4.13). Modul netral agar bisa dipakai
 * shell tema modern dari server layout; sidebar brutalis memakai daftar sama.
 */

export type StaffNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const STAFF_NAV: StaffNavItem[] = [
  { label: "Overview", href: "/staff", icon: Gauge },
  { label: "Booth", href: "/staff/photoboxes", icon: Camera },
  { label: "Outlet", href: "/staff/outlets", icon: Store },
  { label: "Package", href: "/staff/packages", icon: Package },
  { label: "Template", href: "/staff/templates", icon: ImageIcon },
];
