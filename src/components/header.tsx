"use client";

import { cn } from "@/lib/utils";
import { useScroll } from "@/hooks/use-scroll";
import { Button } from "@/components/ui/button";
import { DesktopNav } from "@/components/desktop-nav";
import { MobileNav } from "@/components/mobile-nav";
import Link from "next/link";

/** Header marketing: logo + 2 dropdown + 2 link + 2 CTA. Satu baris, h-14. */
export function Header() {
  const scrolled = useScroll(10);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b-2 transition-colors duration-200",
        scrolled ? "border-ink bg-bg" : "border-transparent bg-transparent"
      )}
    >
      <nav
        aria-label="Navigasi utama"
        className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4"
      >
        <div className="flex items-center gap-5">
          <Link
            className="flex items-center gap-2 border-2 border-transparent px-3 py-2.5 hover:border-ink hover:bg-accent"
            href="/"
          >
            <img
              src="/snapyos-mark.png"
              alt="Logo SnapyOS"
              className="h-7 w-7 border-2 border-ink"
            />
            <span className="font-display text-base uppercase tracking-tight text-ink">
              SnapyOS
            </span>
          </Link>
          <DesktopNav />
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="neutral" nativeButton={false} render={<Link href="/login" />}>
            Masuk
          </Button>
          <Button nativeButton={false} render={<Link href="/register" />}>
            Konsultasi Bisnis
          </Button>
        </div>
        <MobileNav />
      </nav>
    </header>
  );
}
