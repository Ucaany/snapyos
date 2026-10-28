"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { STAFF_NAV, type StaffNavItem } from "@/components/staff/nav";

import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/nav-active";

/**
 * Sidebar khusus role staff, operasional, bukan finansial (docs/04 §4.13).
 * Modul read-only di shell /staff sendiri. Mobile memakai strip sticky yang
 * membungkus (flex-wrap) supaya semua modul terlihat tanpa geser; desktop
 * memakai rail penuh dengan status akses.
 */

export function StaffSidebar() {
  const pathname = usePathname();

  const renderItem = (item: StaffNavItem) => {
    const active = isNavActive(pathname, item.href, "/staff");
    return (
      <Link
        key={item.label}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 shrink-0 items-center gap-2 border-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.05em] transition-all duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          active
            ? "border-ink bg-accent font-bold text-ink shadow-[2px_2px_0_0_#111111]"
            : "border-transparent text-ink hover:border-ink hover:bg-surface active:translate-y-[1px]"
        )}
      >
        <item.icon className="size-4 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navigasi operasional staff"
      className="sticky top-16 z-20 flex flex-wrap gap-1 border-b-2 border-ink bg-bg p-2 md:max-h-[calc(100dvh-4rem)] md:flex-col md:flex-nowrap md:overflow-y-auto md:border-b-0 md:border-r-2 md:bg-transparent md:p-4"
    >
      <div className="mb-2 hidden border-2 border-ink bg-ink px-3 py-2 text-bg md:block">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-bg/70">MODUL</p>
        <p className="font-display text-lg uppercase leading-none tracking-tight">Operasional</p>
      </div>
      {STAFF_NAV.map(renderItem)}
      <div className="mt-4 hidden border-2 border-ink bg-surface p-3 font-mono text-[11px] uppercase leading-snug tracking-[0.06em] text-muted-foreground shadow-[2px_2px_0_0_#111111] md:block">
        <p className="flex items-center gap-1.5 font-bold text-ink">
          <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
          Akses read-only
        </p>
        <p className="mt-1.5">
          Edit paket, template, &amp; booth dikontrol owner. Hubungi owner untuk perubahan.
        </p>
      </div>
    </nav>
  );
}
