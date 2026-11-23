import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/admin/ui/pagination";

/**
 * Paginator admin berbasis shadcn Pagination. Jendela 5 halaman, label
 * Bahasa Indonesia, dan tetap mempertahankan query filter yang aktif.
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

  return (
    <Pagination className="justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={page > 1 ? href(page - 1) : undefined}
            text="Sebelumnya"
            aria-label="Halaman sebelumnya"
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>

        {start > 1 ? (
          <>
            <PaginationItem>
              <PaginationLink href={href(1)} isActive={page === 1}>
                1
              </PaginationLink>
            </PaginationItem>
            {start > 2 ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
          </>
        ) : null}

        {pages.map((p) => (
          <PaginationItem key={p}>
            <PaginationLink href={href(p)} isActive={p === page} aria-label={`Halaman ${p}`}>
              {p}
            </PaginationLink>
          </PaginationItem>
        ))}

        {end < totalPages ? (
          <>
            {end < totalPages - 1 ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            <PaginationItem>
              <PaginationLink href={href(totalPages)} isActive={page === totalPages}>
                {totalPages}
              </PaginationLink>
            </PaginationItem>
          </>
        ) : null}

        <PaginationItem>
          <PaginationNext
            href={page < totalPages ? href(page + 1) : undefined}
            text="Berikutnya"
            aria-label="Halaman berikutnya"
            aria-disabled={page >= totalPages}
            tabIndex={page >= totalPages ? -1 : undefined}
            className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
