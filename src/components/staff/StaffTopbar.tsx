import Link from "next/link";

import { logoutAction } from "@/server/auth-actions";

/**
 * Topbar shell /staff, lebih ramping dari owner: tanpa workspace switcher
 * (staff hanya perlu akses cepat ke operasional). Badge peran "STAFF"
 * dicetak permanen agar staff tidak bingung dengan shell owner.
 */
export function StaffTopbar({
  user,
  businessName,
}: {
  user: { name: string | null | undefined; email: string | null | undefined };
  businessName: string | null | undefined;
}) {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-ink bg-bg">
      <div className="flex h-16 w-full items-center gap-3 px-4 md:gap-4 md:px-6">
        <Link
          href="/staff"
          className="flex min-h-11 shrink-0 items-center gap-2 font-display text-base font-bold uppercase tracking-tight md:min-h-0 md:text-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis 1 file, tidak butuh optimizer next/image */}
          <img
            src="/snapyos-mark.png"
            alt="Logo SnapyOS"
            className="h-8 w-8 shrink-0"
          />
          SnapyOS
          <span className="border-2 border-ink bg-accent px-1.5 py-0.5 text-[10px] leading-none tracking-[0.18em]">
            STAFF
          </span>
        </Link>
        <p className="hidden truncate font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground md:block">
          {"// "}
          {businessName ?? "Tanpa bisnis"}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden text-right md:block">
            <p className="text-sm font-semibold leading-tight">{user.name ?? "Staff"}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {user.email}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-11 items-center border-2 border-ink bg-surface px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.05em] text-ink transition-colors hover:bg-accent active:translate-y-[2px] md:min-h-0 md:px-3 md:text-xs"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
