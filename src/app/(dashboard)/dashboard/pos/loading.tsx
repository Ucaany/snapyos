import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + katalog produk + booth + laporan POS. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-10 p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-full max-w-[60ch]" />
      </div>

      <div className="flex flex-col gap-6">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-11 w-40 border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
        <Skeleton className="h-72 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
      </div>

      <div className="flex flex-col gap-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-48 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
      </div>

      <div className="flex flex-col gap-6">
        <Skeleton className="h-7 w-44" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-20 w-full rounded-none border-2 border-ink shadow-[3px_3px_0_0_#111111]"
            />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
      </div>
    </div>
  );
}
