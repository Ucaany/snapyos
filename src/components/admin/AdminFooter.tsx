import Link from "next/link";

import { version } from "../../../package.json";

const FOOTER_LINKS = [
  { href: "/admin/support", label: "Tiket Bantuan" },
  { href: "/admin/settings", label: "Pengaturan" },
  { href: "/admin/audit", label: "Log Audit" },
  { href: "/docs", label: "Dokumentasi" },
];

// Hanya menampilkan fakta yang diketahui server: tahun, versi, mode runtime.
export function AdminFooter() {
  const year = new Date().getFullYear();
  const environment = process.env.NODE_ENV === "production" ? "Produksi" : "Development";

  return (
    <footer className="mt-auto border-t px-4 py-4 md:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">SnapyOS</span>
          <span aria-hidden="true">·</span>
          <span>Platform Admin</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">v{version}</span>
          <span aria-hidden="true">·</span>
          <span>{environment}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{year}</span>
        </p>
        <nav aria-label="Tautan footer admin">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-0"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
