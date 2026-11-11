import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton dashboard — mencocokkan layout final (docs/13 §13.4:
 * loading = skeleton matching layout, bukan spinner).
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:gap-8 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-[62px] w-full max-w-md" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <Skeleton className="h-44 md:col-span-8" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:col-span-4 md:grid-cols-1">
          <Skeleton className="h-[88px]" />
          <Skeleton className="h-[88px]" />
        </div>
      </div>

      <div className="grid h-24 grid-cols-2 gap-[2px] border-2 border-ink/20 bg-ink/20 md:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-full rounded-none" />
        ))}
      </div>

      <Skeleton className="h-[380px] w-full border-2 border-ink/20" />
    </div>
  );
}
