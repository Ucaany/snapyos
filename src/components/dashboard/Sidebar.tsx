"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buildNavGroups, type NavItem } from "@/components/dashboard/nav";

import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/nav-active";

/**
 * Sidebar navigasi — docs/04 §4 (list modul) + docs/11 §11.6.
 * Desktop/tablet (md+): dikelompokkan per kategori, bisa diciutkan.
 * Mobile: strip horizontal yang menempel di bawah topbar, tetap membawa label
 * grup, dan otomatis menggeser item aktif ke tengah supaya halaman aktif tidak
 * pernah berada di luar layar.
 */

export function Sidebar({
  showPos = false,
  showPwaKiosk = false,
  collapsed = false,
}: {
  showPos?: boolean;
  showPwaKiosk?: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const groups = buildNavGroups(showPos, showPwaKiosk);

  const renderItem = (item: NavItem) => {
    // Link lintas-shell (`/docs`) tidak ditandai aktif di dashboard.
    const crossShell = item.href === "/docs";
    const active = !crossShell && isNavActive(pathname, item.href, "/dashboard");
    return (
      <Link
        key={item.label}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        data-nav-active={active ? "true" : undefined}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-2 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] transition-colors",
          collapsed && "md:w-full md:justify-center md:gap-0 md:px-0",
          active
            ? "border-2 border-ink bg-accent font-bold text-ink"
            : "border-2 border-transparent text-ink hover:bg-muted"
        )}
      >
        <item.icon className="size-4 shrink-0" />
        <span className={cn("whitespace-nowrap", collapsed && "md:hidden")}>{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navigasi utama"
      className="hidden border-b-2 border-ink bg-bg md:sticky md:top-16 md:z-[9] md:block md:border-b-0"
    >
      {/* Desktop/tablet: kategori terpisah dengan header mono. */}
      <div
        className={cn(
          "flex flex-col gap-1 overflow-hidden",
          collapsed ? "px-2 py-4" : "p-4"
        )}
      >
        {groups.map((group, i) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p
              className={cn(
                "px-3 pb-1 pt-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground",
                i === 0 ? "pt-0" : "border-t-2 border-ink/30",
                collapsed && "md:hidden"
              )}
            >
              {group.label}
            </p>
            {group.items.map(renderItem)}
          </div>
        ))}
      </div>
    </nav>
  );
}
