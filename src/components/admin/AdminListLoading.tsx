import { Skeleton } from "@/components/ui/skeleton";

/**
 * Kerangka loading bersama untuk halaman list admin. Bentuknya mengikuti
 * halaman tujuan (header, filter opsional, form opsional, daftar baris) supaya
 * tidak ada lompatan layout saat data selesai dimuat (antislop R-27).
 */
export function AdminListLoading({
  rows = 6,
  showFilter = false,
  showForm = false,
  rowClassName = "h-16",
}: {
  rows?: number;
  showFilter?: boolean;
  showForm?: boolean;
  rowClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-64" />
      </div>
      {showFilter ? <Skeleton className="h-11 w-full max-w-2xl" /> : null}
      {showForm ? <Skeleton className="h-40 border-2 border-ink/10" /> : null}
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className={`${rowClassName} border-2 border-ink/10`} />
        ))}
      </div>
    </div>
  );
}
