"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AlertOctagon,
  Building2,
  CircleHelp,
  CreditCard,
  Gauge,
  ImageIcon,
  Landmark,
  Menu,
  Package,
  Receipt,
  ScrollText,
  Send,
  Settings,
  Store,
  Tag,
  X,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/nav-active";

/**
 * Sidebar Admin Platform - docs/10 §10.1–10.4.
 * Dikelompokkan per kategori (mirror Sidebar owner, docs/11 §11.9):
 * mobile = strip horizontal flat, desktop = grup dengan header mono.
 * Satu accent dominan (accent kuning) per aturan color-consistency (docs/11).
 */

type NavItem = {
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
      // Muncul saat webhook paid tiba setelah subscription cancelled.
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

export function AdminSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Kumpulkan href sub-item yang lebih spesifik dari parent-nya (mis.
  // /admin/subscriptions/pending-review vs /admin/subscriptions). Bila
  // salah satu match tepat, parent-nya jangan ikut aktif - supaya
  // highlight tidak dobel di dua item sekaligus.
  const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

  const renderItem = (item: NavItem) => {
    // `/dashboard` = link cross-shell; jangan tandai aktif di admin.
    if (item.href === "/dashboard") {
      return renderLink(item, false);
    }
    let active = isNavActive(pathname, item.href, "/admin");
    if (active) {
      // Kalau ada item lain yang lebih panjang & lebih spesifik matching
      // pathname, biarkan item tersebut yang aktif (bukan parent).
      const moreSpecific = allHrefs.some(
        (h) =>
          h !== item.href && h.startsWith(`${item.href}/`) && isNavActive(pathname, h, "/admin")
      );
      if (moreSpecific) active = false;
    }
    return renderLink(item, active);
  };

  const renderLink = (item: NavItem, active: boolean) => {
    return (
      <Link
        key={item.label}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-2 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] transition-colors duration-150 ease-[var(--ease-brutal)]",
          // Collapsed: stretch penuh di content-box nav p-2 (46px) + ikon
          // center - border kotak aktif selalu utuh (46 ≥ 4+16), satu sumbu
          // vertikal dengan tombol toggle. Tanpa fit-content/cascade trick.
          collapsed && "md:w-full md:justify-center md:gap-0 md:px-0",
          active ? "border-2 border-ink bg-accent font-bold text-ink" : "text-ink hover:bg-muted"
        )}
        onClick={() => setMobileOpen(false)}
      >
        <item.icon className="size-4 shrink-0" />
        <span className={cn("whitespace-nowrap", collapsed && "md:hidden")}>{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navigasi admin platform"
      className={cn(
        "flex gap-1 overflow-x-auto border-b-2 border-ink p-3 md:flex-col md:overflow-hidden md:border-b-0 md:p-4",
        collapsed && "md:px-2 md:py-4"
      )}
    >
      <div className="flex items-center justify-between gap-2 md:hidden">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em]">
          Menu Admin
        </span>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="admin-mobile-nav"
          aria-label={mobileOpen ? "Tutup menu admin" : "Buka menu admin"}
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center border-2 border-ink bg-surface text-ink hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      <div
        id="admin-mobile-nav"
        className={cn("gap-1 md:hidden", mobileOpen ? "flex flex-col" : "hidden")}
      >
        {NAV_GROUPS.map((group) => (
          <div
            key={group.label}
            className="border-t-2 border-ink/10 pt-2 first:border-t-0 first:pt-0"
          >
            <p className="px-3 pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {group.label}
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop/tablet: kategori terpisah dengan header mono. */}
      {NAV_GROUPS.map((group, i) => (
        <div key={group.label} className="hidden flex-col gap-1 md:flex">
          <p
            className={cn(
              "px-3 pb-1 pt-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground",
              i === 0 ? "pt-0" : "border-t-2 border-ink/10",
              collapsed && "md:hidden"
            )}
          >
            {group.label}
          </p>
          {group.items.map(renderItem)}
        </div>
      ))}
    </nav>
  );
}
