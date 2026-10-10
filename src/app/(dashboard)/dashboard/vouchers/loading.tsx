import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true">
      <div className="flex flex-col gap-3 border-b-2 border-ink pb-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
        <div className="border-b-2 border-ink bg-ink px-4 py-3">
          <Skeleton className="h-3 w-32 bg-bg/40" />
        </div>
        <div className="flex flex-col divide-y-2 divide-ink/10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 gap-4 px-4 py-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-24 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
