import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton paket staff, mengikuti kartu record final (docs/13 §13.6). */
export default function StaffPackagesLoading() {
  return (
    <div
      className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10"
      aria-busy="true"
      aria-label="Memuat paket"
    >
      <div className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] sm:p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-3">
            <Skeleton className="h-6 w-40 border-2 border-ink/20" />
            <Skeleton className="h-10 w-52 max-w-full" />
            <Skeleton className="h-4 w-full max-w-[52ch]" />
          </div>
          <Skeleton className="h-14 w-full border-2 border-ink/20 md:w-32" />
        </div>
      </div>
      <div className="border-2 border-ink/20 shadow-[4px_4px_0_0_#111111]">
        <Skeleton className="h-10 border-0 bg-ink/80" />
        <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-52 border-2 border-ink/20" />
          ))}
        </div>
      </div>
    </div>
  );
}
