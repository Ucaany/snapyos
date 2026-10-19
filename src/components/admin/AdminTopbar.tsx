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
  return (
    <header className="sticky top-0 z-10 border-b-2 border-ink bg-bg">
      <div className="flex h-16 w-full items-center gap-2 px-4 md:gap-4 md:px-6">
        <a href="/admin" className="flex shrink-0 items-center gap-2 font-display text-base font-bold uppercase tracking-tight md:text-lg">
          <img
            src="/snapyos-mark.png"
            alt="Logo SnapyOS"
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
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {user.email}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="border-2 border-ink bg-surface px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.05em] text-ink transition-colors duration-150 ease-[var(--ease-brutal)] hover:bg-accent active:translate-y-[2px] md:px-3 md:text-xs"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
