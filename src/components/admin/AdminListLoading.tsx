import { Skeleton } from "@/components/admin/ui/skeleton";

/**
 * Kerangka loading admin berbasis shadcn Skeleton. Bentuk mengikuti halaman
 * tujuan supaya tidak ada lompatan layout.
 */
export function AdminListLoading({
  rows = 6,
  showFilter = false,
  showForm = false,
  showMetrics = false,
  rowClassName = "h-16",
}: {
  rows?: number;
  showFilter?: boolean;
  showForm?: boolean;
  showMetrics?: boolean;
  rowClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-64" />
      </div>
      {showMetrics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[108px] rounded-xl" />
          ))}
        </div>
      ) : null}
      {showFilter ? <Skeleton className="h-9 w-full max-w-2xl" /> : null}
      {showForm ? <Skeleton className="h-40" /> : null}
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className={rowClassName} />
        ))}
      </div>
    </div>
  );
}
