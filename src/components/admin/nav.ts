import {
  AlertOctagon,
  Building2,
  CircleHelp,
  CreditCard,
  Download,
  Gauge,
  ImageIcon,
  Landmark,
  Package,
  Receipt,
  ScrollText,
  Send,
  Settings,
  Store,
  Tag,
  Users,
} from "lucide-react";

/**
 * Nav Admin Platform - docs/10 §10.1–10.4.
 * Modul netral (tanpa "use client") agar bisa dipakai shell tema modern dari
 * server layout; sidebar brutalis mengimpor daftar yang sama.
 */

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type AdminNavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Utama",
    items: [{ label: "Overview", href: "/admin", icon: Gauge }],
  },
  {
    label: "Tenant",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Businesses", href: "/admin/businesses", icon: Building2 },
    ],
  },
  {
    label: "Monetisasi",
    items: [
      { label: "Plans", href: "/admin/plans", icon: CreditCard },
      { label: "Add-ons", href: "/admin/add-ons", icon: Package },
      { label: "Promos", href: "/admin/promos", icon: Tag },
      { label: "Subscriptions", href: "/admin/subscriptions", icon: Receipt },
      // Antrian review manual aktivasi post-payment - docs/02 §2.4b.
      {
        label: "Antrian Aktivasi Manual",
        href: "/admin/subscriptions/pending-review",
        icon: AlertOctagon,
      },
    ],
  },
  {
    label: "Keuangan",
    items: [
      { label: "Payments", href: "/admin/payments", icon: Landmark },
      { label: "Gateways", href: "/admin/gateways", icon: CreditCard },
    ],
  },
  {
    label: "Konten & Sistem",
    items: [
      { label: "Templates", href: "/admin/templates", icon: ImageIcon },
      { label: "Katalog Aplikasi", href: "/admin/apps", icon: Download },
      { label: "Tiket Bantuan", href: "/admin/support", icon: CircleHelp },
      { label: "Settings", href: "/admin/settings", icon: Settings },
      { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
    ],
  },
  {
    label: "Pemasaran",
    items: [{ label: "Broadcast Email", href: "/admin/broadcasts", icon: Send }],
  },
  {
    // Admin = CEO platform, TAPI tetap bisa pakai semua fitur user
    // (dashboard bisnis / onboarding) — satu akun, dua sisi. Keluar dari
    // shell admin, jadi ditaruh terpisah di bawah, bukan di grup "Utama".
    label: "Sisi Owner",
    items: [{ label: "Buka Dashboard Bisnis", href: "/dashboard", icon: Store }],
  },
];
