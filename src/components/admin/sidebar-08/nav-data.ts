import {
  AlertOctagon,
  CircleHelp,
  CreditCard,
  Gauge,
  ImageIcon,
  Landmark,
  Receipt,
  ScrollText,
  Settings,
  Store,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

export type AdminNavIcon = ComponentType<{ className?: string }>;

export type AdminNavItem = {
  title: string;
  url: string;
  icon: AdminNavIcon;
  items?: Array<{ title: string; url: string }>;
};

export type AdminShortcut = {
  name: string;
  url: string;
  icon: AdminNavIcon;
};

export type AdminSecondaryItem = {
  title: string;
  url: string;
  icon: AdminNavIcon;
};

/**
 * Satu sumber data navigasi admin untuk sidebar-08.
 * Struktur mengikuti sidebar-08: main (collapsible), projects (pintasan),
 * secondary (sistem), dan user (akun).
 */
export const ADMIN_NAV_MAIN: AdminNavItem[] = [
  {
    title: "Ringkasan",
    url: "/admin",
    icon: Gauge,
  },
  {
    title: "Tenant",
    url: "/admin/users",
    icon: Users,
    items: [
      { title: "Pengguna", url: "/admin/users" },
      { title: "Bisnis", url: "/admin/businesses" },
    ],
  },
  {
    title: "Monetisasi",
    url: "/admin/plans",
    icon: CreditCard,
    items: [
      { title: "Paket", url: "/admin/plans" },
      { title: "Add-on", url: "/admin/add-ons" },
      { title: "Promo", url: "/admin/promos" },
      { title: "Langganan", url: "/admin/subscriptions" },
      { title: "Review Aktivasi", url: "/admin/subscriptions/pending-review" },
    ],
  },
  {
    title: "Keuangan",
    url: "/admin/payments",
    icon: Landmark,
    items: [
      { title: "Pembayaran", url: "/admin/payments" },
      { title: "Gateway", url: "/admin/gateways" },
    ],
  },
  {
    title: "Konten",
    url: "/admin/templates",
    icon: ImageIcon,
    items: [
      { title: "Template", url: "/admin/templates" },
      { title: "Broadcast Email", url: "/admin/broadcasts" },
    ],
  },
];

export const ADMIN_NAV_SHORTCUTS: AdminShortcut[] = [
  {
    name: "Review Aktivasi",
    url: "/admin/subscriptions/pending-review",
    icon: AlertOctagon,
  },
  {
    name: "Webhook Error",
    url: "/admin/payments",
    icon: Receipt,
  },
  {
    name: "Buka Dashboard Bisnis",
    url: "/dashboard",
    icon: Store,
  },
];

export const ADMIN_NAV_SECONDARY: AdminSecondaryItem[] = [
  { title: "Tiket Bantuan", url: "/admin/support", icon: CircleHelp },
  { title: "Pengaturan", url: "/admin/settings", icon: Settings },
  { title: "Log Audit", url: "/admin/audit", icon: ScrollText },
];

/** Semua href yang punya halaman nyata, dipakai breadcrumb. */
export const ADMIN_NAV_LABELS: Array<{ url: string; title: string }> = [
  { url: "/admin", title: "Ringkasan" },
  { url: "/admin/users", title: "Pengguna" },
  { url: "/admin/businesses", title: "Bisnis" },
  { url: "/admin/plans", title: "Paket" },
  { url: "/admin/add-ons", title: "Add-on" },
  { url: "/admin/promos", title: "Promo" },
  { url: "/admin/subscriptions", title: "Langganan" },
  { url: "/admin/subscriptions/pending-review", title: "Review Aktivasi" },
  { url: "/admin/payments", title: "Pembayaran" },
  { url: "/admin/gateways", title: "Gateway" },
  { url: "/admin/templates", title: "Template" },
  { url: "/admin/support", title: "Tiket Bantuan" },
  { url: "/admin/settings", title: "Pengaturan" },
  { url: "/admin/audit", title: "Log Audit" },
  { url: "/admin/broadcasts", title: "Broadcast Email" },
];
