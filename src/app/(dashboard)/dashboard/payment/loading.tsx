import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + kartu per gateway (Pakasir/Midtrans/Tripay). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-52" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-56 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]"
        />
      ))}
    </div>
  );
}
