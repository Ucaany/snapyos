import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + grid 2 kolom (form kiri, daftar gateway kanan). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-52" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Skeleton className="h-[32rem] w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
        <div className="grid gap-4">
          <Skeleton className="h-10 w-full rounded-none border-2 border-ink bg-muted" />
          <Skeleton className="h-56 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
          <Skeleton className="h-56 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
        </div>
      </div>
    </div>
  );
}
