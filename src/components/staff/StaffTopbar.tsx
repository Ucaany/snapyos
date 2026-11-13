import Link from "next/link";
import { LogOut } from "lucide-react";

import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import { logoutAction } from "@/server/auth-actions";

/**
 * Topbar shell /staff, lebih ramping dari owner. Workspace switcher tetap ada
 * agar staff yang menjadi member beberapa business bisa berpindah (S-002).
 * Badge peran "STAFF" dicetak permanen agar staff tidak bingung dengan shell
 * owner. Tinggi dipatok `h-16` dan tanpa wrap supaya offset sticky sidebar
 * deterministik.
 */
export function StaffTopbar({
  user,
  businessName,
  businesses,
  activeId,
}: {
  user: { name: string | null | undefined; email: string | null | undefined };
  businessName: string | null | undefined;
  businesses: { id: string; name: string }[];
  activeId: string | null;
}) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink bg-bg">
      <div className="flex h-16 w-full flex-nowrap items-center gap-x-3 px-4 md:gap-4 md:px-6">
        <Link
          href="/staff"
          className="flex min-h-11 shrink-0 items-center gap-2 font-display text-base font-bold uppercase tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink md:text-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis 1 file, tidak butuh optimizer next/image */}
          <img src="/snapyos-mark.png" alt="Logo SnapyOS" className="h-8 w-8 shrink-0" />
          SnapyOS
          <span className="border-2 border-ink bg-accent px-1.5 py-0.5 font-mono text-[11px] leading-none tracking-[0.18em] shadow-[2px_2px_0_0_#111111]">
            STAFF
          </span>
        </Link>
        <div className="hidden min-w-0 md:block">
          <WorkspaceSwitcher businesses={businesses} activeId={activeId} />
        </div>
        <p className="hidden min-w-0 max-w-[28ch] truncate border-2 border-ink bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground lg:block">
          <span className="text-ink">BISNIS</span> {businessName ?? "Tanpa bisnis"}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden text-right sm:block">
            <p className="max-w-[22ch] truncate text-sm font-semibold leading-tight">
              {user.name ?? "Staff"}
            </p>
            <p className="max-w-[26ch] truncate font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {user.email}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-11 items-center gap-1.5 border-2 border-ink bg-surface px-2.5 py-2 font-mono text-[11px] uppercase tracking-[0.05em] text-ink shadow-[2px_2px_0_0_#111111] transition-all duration-100 hover:bg-accent hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:px-3"
            >
              <LogOut className="size-3.5" aria-hidden />
              Keluar
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
