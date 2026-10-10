import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true">
      <div className="flex flex-col gap-3 border-b-2 border-ink pb-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-40 w-full border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex flex-col border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
            <Skeleton className="h-44 w-full rounded-none border-b-2 border-ink" />
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <div className="mt-auto flex justify-between border-t-2 border-ink/10 pt-3">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-20" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
