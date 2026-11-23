import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/server/auth-actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { LogoutButton } from "@/components/dashboard/LogoutButton";
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
          <MobileNav
            showPos={showPos}
            showPwaKiosk={showPwaKiosk}
            footer={
              <div className="flex flex-col gap-3 border-t-2 border-ink/20 pt-4 sm:hidden">
                {activeBusinessId && <StorageIndicator businessId={activeBusinessId} />}
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className={buttonVariants({
                      variant: "default",
                      size: "sm",
                      className: "w-full",
                    })}
                  >
                    Panel Admin
                  </Link>
                ) : null}
                <div>
                  <p className="text-sm font-semibold leading-tight">{user.name ?? "Owner"}</p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
            }
          />
          {activeBusinessId && (
            <div className="hidden sm:block">
              <StorageIndicator businessId={activeBusinessId} />
            </div>
          )}
          {isAdmin ? (
            <Link
              href="/admin"
              className={buttonVariants({
                variant: "default",
                size: "sm",
                className: "hidden sm:inline-flex",
              })}
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
            <LogoutButton />
          </form>
        </div>
      </div>
    </header>
  );
}
