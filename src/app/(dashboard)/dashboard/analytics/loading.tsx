import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + DateRangeFilter + 5 tab pills + 1 chart block. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:gap-8 md:p-10" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <Skeleton className="h-11 w-64" />
      </div>
      <div className="flex flex-wrap gap-2 border-b-2 border-ink pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>
      <Skeleton className="h-[420px] w-full border-2 border-ink shadow-hard" />
    </div>
  );
}
