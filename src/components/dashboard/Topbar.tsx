import Link from "next/link";

import { logoutAction } from "@/server/auth-actions";
import { StorageIndicator } from "@/components/dashboard/StorageIndicator";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";

/**
 * Topbar — workspace switcher + storage indicator + user menu (docs/04 §4.16, docs/11 §11.6).
 * Search & notifikasi menyusul di fase terkait (tidak dipalsukan).
 */
export function Topbar({
  user,
  businesses,
  activeBusiness,
  isAdmin = false,
}: {
  user: { name: string | null | undefined; email: string | null | undefined };
  businesses: { id: string; name: string }[];
  activeBusiness: { id: string; name: string } | null;
  isAdmin?: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 border-b-2 border-ink bg-bg">
      <div className="flex h-16 w-full items-center gap-2 px-4 md:gap-4 md:px-6">
        <Link
          href="/dashboard"
          className="flex min-h-11 shrink-0 items-center gap-2 font-display text-base font-bold uppercase tracking-tight [@media(pointer:coarse)]:min-h-11 md:text-lg"
        >
          <img src="/snapyos-mark.png" alt="Logo SnapyOS" className="h-8 w-8 shrink-0" />
          SnapyOS<span className="text-accent">®</span>
        </Link>

        <WorkspaceSwitcher businesses={businesses} activeId={activeBusiness?.id ?? null} />

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {activeBusiness && <StorageIndicator businessId={activeBusiness.id} />}
          {isAdmin ? (
            <Link
              href="/admin"
              className="border-2 border-ink bg-accent px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink transition-colors hover:bg-accent/80 active:translate-y-[2px] md:px-3 md:text-xs"
            >
              Panel Admin
            </Link>
          ) : null}
          <div className="hidden text-right lg:block">
            <p className="text-sm font-semibold leading-tight">{user.name ?? "Owner"}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {user.email}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="min-h-11 min-w-11 border-2 border-ink bg-surface px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.05em] text-ink transition-colors hover:bg-accent active:translate-y-[2px] md:px-3 md:text-xs"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
