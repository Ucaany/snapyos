"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cloneElement, isValidElement, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SIDEBAR_COLLAPSE_COOKIE } from "@/lib/sidebar-collapse";

/**
 * Shell kolaborasi (owner + admin) dengan sidebar desktop yang bisa diciutkan
 * (docs/11 §11.9). Desktop: 240px → 64px ikon saja,
 * konten utama melebar — transisi grid-template-columns 200ms. State cookie
 * per-browser (dibaca server di layout). Mobile tidak berubah (strip horizontal).
 */
export function CollapsibleShell({
  sidebar,
  children,
  defaultCollapsed = false,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000`;
  };

  // Sidebar diterima sebagai ReactNode, tapi butuh tahu state collapsed
  // (sembunyikan label, justify-center ikon, padding ketat). Injeksi prop
  // di sini agar `Sidebar`/`AdminSidebar` benar-benar ikut menciut — tanpa
  // ini konten sidebar tetap lebar dan meluber menutupi kolom utama.
  const sidebarEl = isValidElement<{ collapsed?: boolean }>(sidebar)
    ? cloneElement(sidebar, { collapsed })
    : sidebar;

  return (
    <div
      className="grid w-full flex-1 content-start grid-cols-1 md:content-stretch md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)] md:transition-[grid-template-columns] md:duration-200 md:ease-in-out motion-reduce:transition-none"
      style={{ "--sidebar-w": collapsed ? "64px" : "240px" } as CSSProperties}
    >
      <div className="md:sticky md:top-16 md:flex md:max-h-[calc(100dvh-4rem)] md:flex-col md:overflow-hidden md:border-r-2 md:border-ink">
        <div
          className={cn(
            "hidden shrink-0 items-center border-b-2 border-ink bg-bg py-2 md:flex",
            collapsed ? "md:justify-center" : "md:px-4"
          )}
        >
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            className="relative flex size-8 items-center justify-center border-2 border-ink bg-surface text-ink transition-colors after:absolute after:-inset-1.5 hover:bg-accent active:translate-y-[2px]"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
        <div className="min-h-0 flex-1 md:overflow-y-auto">{sidebarEl}</div>
      </div>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
