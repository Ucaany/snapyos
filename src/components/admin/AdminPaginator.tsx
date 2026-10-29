import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/**
 * Paginator brutalist untuk halaman admin. Nomor halaman dibatasi jendela 5
 * halaman supaya tidak meledak saat total halaman besar. Navigasi memakai
 * ikon Lucide (bukan glyph `<`/`>>`) agar terbaca sama di semua font, dengan
 * `aria-label` sebagai nama aksesibel.
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

  const cell = (active = false) =>
    cn(
      buttonVariants({ variant: active ? "default" : "outline", size: "icon" }),
      "font-mono tabular-nums"
    );

  return (
    <nav
      aria-label="Paginasi"
      className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.1em]"
    >
      <span className="hidden text-muted-foreground sm:inline">Halaman</span>
      {start > 1 ? (
        <Link
          href={href(1)}
          aria-label="Halaman pertama"
          title="Halaman pertama"
          className={cell()}
        >
          <ChevronsLeft className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          aria-label="Halaman sebelumnya"
          title="Halaman sebelumnya"
          className={cell()}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
      {start > 1 ? (
        <span className="px-1 text-muted-foreground" aria-hidden="true">
          ...
        </span>
      ) : null}
      {pages.map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-current={p === page ? "page" : undefined}
          aria-label={`Halaman ${p}`}
          className={cell(p === page)}
        >
          {String(p).padStart(2, "0")}
        </Link>
      ))}
      {end < totalPages ? (
        <span className="px-1 text-muted-foreground" aria-hidden="true">
          ...
        </span>
      ) : null}
      {page < totalPages ? (
        <Link
          href={href(page + 1)}
          aria-label="Halaman berikutnya"
          title="Halaman berikutnya"
          className={cell()}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
      {end < totalPages ? (
        <Link
          href={href(totalPages)}
          aria-label="Halaman terakhir"
          title="Halaman terakhir"
          className={cell()}
        >
          <ChevronsRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
      <span className="ml-1 text-muted-foreground tabular-nums">
        {page}/{totalPages}
      </span>
    </nav>
  );
}
