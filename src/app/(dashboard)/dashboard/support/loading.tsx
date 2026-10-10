import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + daftar tiket bantuan. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
    </div>
  );
}
