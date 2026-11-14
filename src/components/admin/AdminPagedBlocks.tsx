"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { buttonVariants } from "@/components/admin/ui/button";
import { Table, TableBody, TableHeader } from "@/components/admin/ui/table";
import { cn } from "@/lib/utils";

// Paginasi klien: data sudah lengkap di server, cukup batasi baris per halaman.
export function AdminPager({
  page,
  totalPages,
  onPageChange,
  itemLabel,
  totalItems,
  pageSize,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemLabel: string;
  totalItems: number;
  pageSize: number;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(totalItems, page * pageSize);
  const windowSize = 5;
  let start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Baris {first}–{last} dari {totalItems} {itemLabel}
      </p>
      <nav role="navigation" aria-label={`Paginasi ${itemLabel}`}>
        <ul className="flex items-center gap-0.5">
          <li>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              aria-label="Halaman sebelumnya"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-11 lg:size-8 disabled:pointer-events-none disabled:opacity-40"
              )}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
          </li>
          {start > 1 ? (
            <li>
              <button
                type="button"
                onClick={() => onPageChange(1)}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "size-11 text-xs lg:size-8"
                )}
                aria-label="Halaman 1"
              >
                1
              </button>
            </li>
          ) : null}
          {pages.map((target) => (
            <li key={target}>
              <button
                type="button"
                onClick={() => onPageChange(target)}
                aria-current={target === page ? "page" : undefined}
                aria-label={`Halaman ${target}`}
                className={cn(
                  buttonVariants({ variant: target === page ? "outline" : "ghost", size: "icon" }),
                  "size-11 text-xs tabular-nums lg:size-8"
                )}
              >
                {target}
              </button>
            </li>
          ))}
          {end < totalPages ? (
            <li>
              <button
                type="button"
                onClick={() => onPageChange(totalPages)}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "size-11 text-xs lg:size-8"
                )}
                aria-label={`Halaman ${totalPages}`}
              >
                {totalPages}
              </button>
            </li>
          ) : null}
          <li>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              aria-label="Halaman berikutnya"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-11 lg:size-8 disabled:pointer-events-none disabled:opacity-40"
              )}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** Tabel admin dengan batas baris per halaman + paginasi di bawah. */
export function AdminPagedTable({
  header,
  rows,
  pageSize = 5,
  itemLabel = "baris",
  empty,
}: {
  header: ReactNode;
  rows: ReactNode[];
  pageSize?: number;
  itemLabel?: string;
  empty?: ReactNode;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);

  if (!rows.length) return <>{empty ?? null}</>;

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>{header}</TableHeader>
        <TableBody>{visible}</TableBody>
      </Table>
      {totalPages > 1 ? (
        <AdminPager
          page={current}
          totalPages={totalPages}
          onPageChange={setPage}
          itemLabel={itemLabel}
          totalItems={rows.length}
          pageSize={pageSize}
        />
      ) : null}
    </div>
  );
}
