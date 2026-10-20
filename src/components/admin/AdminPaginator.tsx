import Link from "next/link";

/**
 * Paginator brutalist untuk halaman admin. Nomor halaman diganti `>`/`<`
 * dengan jendela 5 halaman supaya tidak meledak saat total halaman besar
 * (sebelumnya `Array.from({ length: totalPages })` merender semua nomor).
 *
 * basePath = pathname tanpa query (mis. "/admin/users").
 * searchParams = query yang dipertahankan lintas halaman.
 */
export function AdminPaginator({
  basePath,
  page,
  totalPages,
  searchParams = {},
}: {
  basePath: string;
  page: number;
  totalPages: number;
  searchParams?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v) qs.set(k, v);
    }
    qs.set("page", String(target));
    return `${basePath}?${qs.toString()}`;
  };

  const windowSize = 5;
  let start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const cell =
    "inline-flex min-h-11 min-w-11 items-center justify-center border-2 border-ink bg-surface px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] transition-colors duration-150 ease-[var(--ease-brutal)] hover:bg-muted";
  const activeCell =
    "inline-flex min-h-11 min-w-11 items-center justify-center border-2 border-ink bg-accent px-3 py-1.5 font-mono text-xs font-bold";

  return (
    <nav
      aria-label="Paginasi"
      className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.1em]"
    >
      {start > 1 ? (
        <Link href={href(1)} aria-label="Halaman pertama" className={cell}>
          {"<<"}
        </Link>
      ) : null}
      {page > 1 ? (
        <Link href={href(page - 1)} aria-label="Halaman sebelumnya" className={cell}>
          {"<"}
        </Link>
      ) : null}
      {start > 1 ? (
        <span className="px-1 text-muted-foreground" aria-hidden="true">
          …
        </span>
      ) : null}
      {pages.map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-current={p === page ? "page" : undefined}
          className={p === page ? activeCell : cell}
        >
          {String(p).padStart(2, "0")}
        </Link>
      ))}
      {end < totalPages ? (
        <span className="px-1 text-muted-foreground" aria-hidden="true">
          …
        </span>
      ) : null}
      {page < totalPages ? (
        <Link href={href(page + 1)} aria-label="Halaman berikutnya" className={cell}>
          {">"}
        </Link>
      ) : null}
      {end < totalPages ? (
        <Link href={href(totalPages)} aria-label="Halaman terakhir" className={cell}>
          {">>"}
        </Link>
      ) : null}
      <span className="ml-1 text-muted-foreground">
        {page}/{totalPages}
      </span>
    </nav>
  );
}
