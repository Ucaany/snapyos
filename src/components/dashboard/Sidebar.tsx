"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
} from "lucide-react"

import { cn } from "@/lib/utils"
import { isNavActive } from "@/lib/nav-active"

/**
 * Sidebar navigasi — docs/04 §4 (list modul) + docs/11 §11.6.
 * 16 item: 14 modul PRD + entry Analytics & Metrics (docs/04 §4.2–4.3).
 * Desktop/tablet (md+): dikelompokkan per kategori (bukan 1 kolom panjang
 * menyatu) — docs/11 §11.9. Mobile: strip horizontal scroll, tanpa header.
 */

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

type NavGroup = { label: string; items: NavItem[] }

/**
 * Nav groups — POS (add-on) dirender hanya jika entitlement aktif +
 * role punya pos:read (R10); keamanan tetap di server (requirePosAccess).
 */
function buildNavGroups(showPos = false, showPwaKiosk = false): NavGroup[] {
  const groups: NavGroup[] = [
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
      ...(showPwaKiosk ? [{ label: "Unduh PWA", href: "/dashboard/pwa", icon: Download }] : []),
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
  ]
  return groups
}

export function Sidebar({
  showPos = false,
  showPwaKiosk = false,
  collapsed = false,
}: {
  showPos?: boolean
  showPwaKiosk?: boolean
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const groups = buildNavGroups(showPos, showPwaKiosk)

  const renderItem = (item: NavItem) => {
    // Link lintas-shell (`/docs`) tidak ditandai aktif di dashboard.
    const crossShell = item.href === "/docs"
    const active = !crossShell && isNavActive(pathname, item.href, "/dashboard")
    return (
      <Link
        key={item.label}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-2 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] transition-colors md:min-h-0",
          // Collapsed: stretch penuh di content-box nav p-2 (46px) + ikon
          // center — border kotak aktif selalu utuh (46 ≥ 4+16), satu sumbu
          // vertikal dengan tombol toggle. Tanpa fit-content/cascade trick.
          collapsed && "md:w-full md:justify-center md:gap-0 md:px-0",
          active ? "border-2 border-ink bg-accent font-bold text-ink" : "text-ink hover:bg-muted"
        )}
      >
        <item.icon className="size-4 shrink-0" />
        <span className={cn("whitespace-nowrap", collapsed && "md:hidden")}>{item.label}</span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Navigasi utama"
      className={cn(
        "flex gap-1 overflow-x-auto border-b-2 border-ink p-3 md:flex-col md:overflow-hidden md:border-b-0 md:p-4",
        collapsed && "md:px-2 md:py-4"
      )}
    >
      {/* Mobile: strip horizontal flat. */}
      <div className="flex gap-1 md:hidden">{groups.flatMap((g) => g.items).map(renderItem)}</div>

      {/* Desktop/tablet: kategori terpisah dengan header mono. */}
      {groups.map((group, i) => (
        <div key={group.label} className="hidden flex-col gap-1 md:flex">
          <p
            className={cn(
              "px-3 pb-1 pt-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground",
              i === 0 ? "pt-0" : "border-t-2 border-ink/30",
              collapsed && "md:hidden"
            )}
          >
            {group.label}
          </p>
          {group.items.map(renderItem)}
        </div>
      ))}
    </nav>
  )
}
