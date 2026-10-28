import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + blok konten utama. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-420px w-full border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
    </div>
  );
}
