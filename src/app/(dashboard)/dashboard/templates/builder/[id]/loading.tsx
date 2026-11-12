import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton builder: PageHeader + kanvas preview + panel kontrol (docs/11 §loading). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Skeleton className="mx-auto aspect-3/4 w-full max-w-[420px] border-2 border-ink shadow-hard" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-40 w-full border-2 border-ink shadow-hard" />
          <Skeleton className="h-52 w-full border-2 border-ink shadow-hard" />
        </div>
      </div>
    </div>
  );
}
