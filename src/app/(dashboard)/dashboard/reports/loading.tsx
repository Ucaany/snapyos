import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + form report (tipe/rentang/format). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:gap-8 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="border-2 border-ink bg-surface shadow-hard">
        <div className="border-b-2 border-ink p-6">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-none border-2 border-ink/20" />
          ))}
          <Skeleton className="h-11 w-40 rounded-none border-2 border-ink/20 bg-accent/40 md:col-span-4" />
        </div>
      </div>
    </div>
  );
}
