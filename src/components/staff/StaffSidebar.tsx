"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Camera, Gauge, ImageIcon, Package, Store, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { isNavActive } from "@/lib/nav-active"

/**
 * Sidebar khusus role staff, operasional, bukan finansial (docs/04 §4.13).
 * Modul read-only di shell /staff sendiri (bukan /dashboard/* yang
 * me-redirect staff-only). Gaya item = persis Sidebar owner (docs/11 §11.6):
 * flat px-3 py-2, active border-2 + bg-accent, mobile strip horizontal.
 */

type StaffNavItem = {
  label: string
  href: string
  icon: LucideIcon
}

const STAFF_NAV: StaffNavItem[] = [
  { label: "Overview", href: "/staff", icon: Gauge },
  { label: "Booth", href: "/staff/photoboxes", icon: Camera },
  { label: "Outlet", href: "/staff/outlets", icon: Store },
  { label: "Package", href: "/staff/packages", icon: Package },
  { label: "Template", href: "/staff/templates", icon: ImageIcon },
]

export function StaffSidebar() {
  const pathname = usePathname()

  const renderItem = (item: StaffNavItem) => {
    const active = isNavActive(pathname, item.href, "/staff")
    return (
      <Link
        key={item.label}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-2 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] transition-colors md:min-h-0",
          active ? "border-2 border-ink bg-accent font-bold text-ink" : "text-ink hover:bg-muted"
        )}
      >
        <item.icon className="size-4" />
        <span className="whitespace-nowrap">{item.label}</span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Navigasi operasional staff"
      className="flex gap-1 overflow-x-auto border-b-2 border-ink p-3 md:sticky md:top-16 md:max-h-[calc(100dvh-4rem)] md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r-2 md:p-4"
    >
      {/* Mobile: strip horizontal flat, pola Sidebar owner. */}
      <div className="flex gap-1 md:hidden">{STAFF_NAV.map(renderItem)}</div>

      {/* Desktop: grup tunggal dengan header mono, pola Sidebar owner. */}
      <div className="hidden flex-col gap-1 md:flex">
        <p className="px-3 pb-1 pt-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Operasional
        </p>
        {STAFF_NAV.map(renderItem)}
        <div className="mt-4 border-2 border-dashed border-ink/30 bg-muted/40 p-3 font-mono text-[10px] uppercase leading-snug tracking-[0.06em] text-muted-foreground">
          <p className="text-ink/70">
            <span className="text-accent-3-strong">{"[ INFO ]"}</span> Akses read-only.
          </p>
          <p className="mt-1">
            Edit paket, template, &amp; booth dikontrol owner. Hubungi owner untuk perubahan.
          </p>
        </div>
      </div>
    </nav>
  )
}
