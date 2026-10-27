import { Camera, Gauge, ImageIcon, Package, Store } from "lucide-react";

/**
 * Nav shell staff (read-only, docs/04 §4.13). Label Bahasa Indonesia agar
 * konsisten dengan judul halaman dan isi (DESIGN.md §7).
 */

export type StaffNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const STAFF_NAV: StaffNavItem[] = [
  { label: "Ringkasan", href: "/staff", icon: Gauge },
  { label: "Booth", href: "/staff/photoboxes", icon: Camera },
  { label: "Outlet", href: "/staff/outlets", icon: Store },
  { label: "Paket", href: "/staff/packages", icon: Package },
  { label: "Template", href: "/staff/templates", icon: ImageIcon },
];
