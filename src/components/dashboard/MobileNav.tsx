"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { buildNavGroups } from "@/components/dashboard/nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/nav-active";

/**
 * Menu navigasi mobile: satu tombol berlabel di topbar, panel penuh di bawah
 * topbar. Menggantikan strip horizontal panjang yang memaksa pengguna
 * menggeser jauh untuk mencapai menu di ujung kanan.
 */
export function MobileNav({
  showPos = false,
  showPwaKiosk = false,
  footer,
}: {
  showPos?: boolean;
  showPwaKiosk?: boolean;
  /** Aksi sekunder yang dipindah dari topbar pada layar <sm. */
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Tutup panel saat rute berubah lewat penyesuaian state saat render (pola
  // resmi React untuk state turunan), bukan effect yang memicu render berantai.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (renderedPath !== pathname) {
    setRenderedPath(pathname);
    if (open) setOpen(false);
  }
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  const groups = buildNavGroups(showPos, showPwaKiosk);

  useEffect(() => {
    if (!open) {
      // Kembalikan fokus ke tombol pemicu saat panel ditutup.
      if (wasOpen.current) triggerRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        ref={triggerRef}
        type="button"
        variant="neutral"
        size="sm"
        aria-label={open ? "Tutup menu" : "Buka menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        title={open ? "Tutup menu" : "Buka menu"}
        onClick={() => setOpen((value) => !value)}
        className="gap-1.5 px-2"
      >
        {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
        <span className="hidden sm:inline">Menu</span>
      </Button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Tutup menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-16 z-40 bg-ink/40"
          />
          <div
            id="mobile-nav-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
            className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto border-t-2 border-ink bg-bg p-4"
          >
            <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
              {groups.map((group) => (
                <section key={group.label} aria-labelledby={`mobile-nav-${group.label}`}>
                  <p
                    id={`mobile-nav-${group.label}`}
                    className="border-b-2 border-ink/20 pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
                  >
                    {group.label}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const crossShell = item.href === "/docs";
                      const active = !crossShell && isNavActive(pathname, item.href, "/dashboard");
                      return (
                        <Link
                          key={item.label}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-2 border-2 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em]",
                            active
                              ? "border-ink bg-accent font-bold text-ink"
                              : "border-transparent text-ink hover:border-ink hover:bg-muted"
                          )}
                        >
                          <item.icon className="size-4 shrink-0" aria-hidden />
                          <span className="min-w-0 break-words">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
              {footer}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
