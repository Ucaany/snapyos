import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/server/auth-actions";
import { IconButton } from "@/components/ui/icon-button";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { StorageIndicator } from "@/components/dashboard/StorageIndicator";

/**
 * Topbar — workspace switcher + storage indicator + user menu (docs/04 §4.16, docs/11 §11.6).
 * Satu baris 64px. Di layar sempit wordmark dan aksi sekunder disembunyikan
 * supaya pemilih workspace (konteks bisnis aktif) tetap terbaca, bukan terpotong.
 * Search & notifikasi menyusul di fase terkait (tidak dipalsukan).
 */
export function Topbar({
  user,
  workspaceSlot,
  activeBusinessId,
  isAdmin = false,
  showPos = false,
  showPwaKiosk = false,
}: {
  user: { name: string | null | undefined; email: string | null | undefined };
  workspaceSlot: ReactNode;
  activeBusinessId: string | null;
  isAdmin?: boolean;
  showPos?: boolean;
  showPwaKiosk?: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 border-b-2 border-ink bg-bg">
      <div className="flex h-16 w-full items-center gap-2 px-4 md:gap-4 md:px-6">
        <Link
          href="/dashboard"
          className="flex min-h-11 shrink-0 items-center gap-2 font-display text-base font-bold uppercase tracking-tight md:text-lg"
        >
          <Image
            src="/snapyos-mark.png"
            alt="Logo SnapyOS"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0"
            priority
          />
          <span className="hidden sm:inline">
            SnapyOS<span className="text-accent">®</span>
          </span>
        </Link>

        {workspaceSlot}

        <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
          <MobileNav showPos={showPos} showPwaKiosk={showPwaKiosk} />
          {activeBusinessId && <StorageIndicator businessId={activeBusinessId} />}
          {isAdmin ? (
            <Link
              href="/admin"
              className="hidden min-h-11 items-center border-2 border-ink bg-accent px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink transition-colors hover:bg-accent/80 active:translate-y-[2px] sm:inline-flex md:px-3 md:text-xs"
            >
              Panel Admin
            </Link>
          ) : null}
          <div className="hidden text-right lg:block">
            <p className="text-sm font-semibold leading-tight">{user.name ?? "Owner"}</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              {user.email}
            </p>
          </div>
          <form action={logoutAction}>
            <IconButton type="submit" label="Keluar" compact variant="outline">
              <LogOut className="size-4" aria-hidden="true" />
            </IconButton>
          </form>
        </div>
      </div>
    </header>
  );
}
