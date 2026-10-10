import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: PageHeader + panel editor branding kiosk. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-52" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-44 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]"
            />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-none border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
      </div>
    </div>
  );
}
