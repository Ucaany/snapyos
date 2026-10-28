import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton overview staff, mengikuti hierarki panel final (docs/13 §13.6). */
export default function StaffOverviewLoading() {
  return (
    <div
      className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10"
      aria-busy="true"
      aria-label="Memuat ringkasan staff"
    >
      <div className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] sm:p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-3">
            <Skeleton className="h-6 w-40 border-2 border-ink/20" />
            <Skeleton className="h-10 w-72 max-w-full" />
            <Skeleton className="h-4 w-full max-w-[52ch]" />
          </div>
          <div className="grid gap-2 md:grid-cols-1">
            <Skeleton className="h-11 w-full border-2 border-ink/20 md:w-56" />
            <Skeleton className="h-11 w-full border-2 border-ink/20 md:w-56" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-[5.5rem] border-2 border-ink/20 shadow-[3px_3px_0_0_#111111]"
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="border-2 border-ink/20 shadow-[4px_4px_0_0_#111111]">
          <Skeleton className="h-10 border-0 bg-ink/80" />
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <Skeleton className="h-56 border-2 border-ink/20" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-[5.5rem]" />
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <div className="border-2 border-ink/20 shadow-[4px_4px_0_0_#111111]">
            <Skeleton className="h-10 border-0 bg-ink/80" />
            <div className="space-y-3 p-4 sm:p-5">
              <Skeleton className="h-24 border-2 border-ink/20" />
              <Skeleton className="h-24 border-2 border-ink/20" />
            </div>
          </div>
          <Skeleton className="h-36 border-2 border-ink/20" />
        </div>
      </div>

      <div className="border-2 border-ink/20 shadow-[4px_4px_0_0_#111111]">
        <Skeleton className="h-10 border-0 bg-ink/80" />
        <div className="grid gap-3 p-4 md:grid-cols-2 sm:p-5 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 border-2 border-ink/20" />
          ))}
        </div>
      </div>
    </div>
  );
}
