import { LogOut } from "lucide-react";

import { logoutAction } from "@/server/auth-actions";

/**
 * AdminTopbar - mirror Topbar owner (docs/11 §11.6) tanpa workspace switcher.
 * Admin = satu scope platform, label mono pengganti switcher.
 */
export function AdminTopbar({
  user,
}: {
  user: { name: string | null | undefined; email: string | null | undefined };
}) {
  const identity = user.name?.trim() || user.email || "Admin";
  const initials = identity
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="sticky top-0 z-10 border-b-2 border-ink bg-bg">
      <div className="flex h-16 w-full items-center gap-2 px-4 md:gap-4 md:px-6">
        <a
          href="/admin"
          className="flex min-h-11 shrink-0 items-center gap-2 font-display text-base font-bold uppercase tracking-tight md:text-lg"
        >
          <img
            src="/snapyos-mark.png"
            alt="Logo SnapyOS"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0"
          />
          SnapyOS<span className="text-accent">®</span>
        </a>

        <span className="hidden h-9 min-w-0 items-center border-2 border-ink bg-surface px-3 font-mono text-xs uppercase tracking-[0.05em] text-ink sm:flex">
          Platform · Admin
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden text-right md:block">
            <p className="text-sm font-semibold leading-tight">{user.name ?? "Admin"}</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              {user.email}
            </p>
          </div>
          {/* Identitas tetap terlihat di handphone: perangkat booth sering dipakai bergantian. */}
          <span
            title={identity}
            className="flex size-11 shrink-0 items-center justify-center border-2 border-ink bg-accent font-mono text-xs font-bold uppercase md:hidden"
          >
            {initials || "A"}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Keluar"
              title="Keluar"
              className="flex size-11 min-h-11 min-w-11 items-center justify-center border-2 border-ink bg-surface text-ink transition-colors duration-150 ease-[var(--ease-brutal)] hover:bg-accent active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
