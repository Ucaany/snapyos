"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildNavGroups, type NavItem } from "@/components/dashboard/nav";

import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/nav-active";

/**
 * Sidebar navigasi — docs/04 §4 (list modul) + docs/11 §11.6.
 * 5 grup, 19 item tetap; POS & Unduh PWA menyusul saat entitlement/fitur aktif
 * (docs/04 §4.2–4.3).
 * Desktop/tablet (md+): dikelompokkan per kategori (bukan 1 kolom panjang
 * menyatu) — docs/11 §11.9. Mobile: strip horizontal scroll, tanpa header.
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
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-2 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] transition-colors",
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
    );
  };

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
  );
}
