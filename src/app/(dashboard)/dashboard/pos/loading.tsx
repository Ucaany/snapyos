import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + katalog POS + ringkasan laporan. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-10 w-44" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
    </div>
  );
}
