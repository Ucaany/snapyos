import {
  BookOpen,
  Camera,
  CircleHelp,
  CreditCard,
  Download,
  FileText,
  Gauge,
  ImageIcon,
  Landmark,
  LayoutDashboard,
  Package,
  Palette,
  Receipt,
  ScanBarcode,
  Settings,
  Store,
  Ticket,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

/**
 * Daftar nav owner — dipakai sidebar brutalis (client) DAN shell tema modern
 * (server layout). Modul netral: tanpa "use client", jadi bisa dipanggil dari
 * server component. Tipe & data saja, tanpa JSX.
 *
 * POS & Unduh PWA menyusul saat entitlement/fitur aktif (docs/04 §4.2–4.3);
 * keamanan tetap di server (requirePosAccess).
 */

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type NavGroup = { label: string; items: NavItem[] };

export function buildNavGroups(showPos = false, showPwaKiosk = false): NavGroup[] {
  return [
    {
      label: "Utama",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Analitik", href: "/dashboard/analytics", icon: TrendingUp },
        { label: "Metrik", href: "/dashboard/metrics", icon: Gauge },
      ],
    },
    {
      label: "Operasional",
      items: [
        { label: "Photobox", href: "/dashboard/photoboxes", icon: Camera },
        { label: "Branding & Kiosk", href: "/dashboard/branding", icon: Palette },
        { label: "Outlet", href: "/dashboard/outlets", icon: Store },
        { label: "Template", href: "/dashboard/templates", icon: ImageIcon },
        { label: "Paket", href: "/dashboard/packages", icon: Package },
        { label: "Voucher", href: "/dashboard/vouchers", icon: Ticket },
        ...(showPos ? [{ label: "POS", href: "/dashboard/pos", icon: ScanBarcode }] : []),
        ...(showPwaKiosk
          ? [{ label: "Unduh PWA", href: "/dashboard/pwa", icon: Download }]
          : []),
        // Installer booth (EXE) — tautan admin, bukan unggahan SNAPY OS.
        { label: "Aplikasi Booth", href: "/dashboard/apps", icon: Download },
      ],
    },
    {
      label: "Keuangan",
      items: [
        { label: "Transaksi", href: "/dashboard/transactions", icon: Receipt },
        { label: "Keuangan", href: "/dashboard/finance", icon: Wallet },
        { label: "Payment Gateway", href: "/dashboard/payment", icon: Landmark },
        { label: "Laporan", href: "/dashboard/reports", icon: FileText },
      ],
    },
    {
      label: "Pelanggan & Tim",
      items: [
        { label: "Pelanggan", href: "/dashboard/customers", icon: Users },
        { label: "Tim", href: "/dashboard/staff", icon: UserCog },
      ],
    },
    {
      label: "Langganan & Akun",
      items: [
        { label: "Langganan", href: "/dashboard/subscription", icon: CreditCard },
        { label: "Pengaturan", href: "/dashboard/settings", icon: Settings },
        { label: "Tiket Bantuan", href: "/dashboard/support", icon: CircleHelp },
        { label: "Dokumentasi", href: "/docs", icon: BookOpen },
      ],
    },
  ];
}
