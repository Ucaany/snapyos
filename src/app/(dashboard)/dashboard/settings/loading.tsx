import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton match layout: max-w-3xl grid 1-col dengan 2 form stacked. */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6 md:p-10" aria-busy="true">
      <div className="flex flex-col gap-3 border-b-2 border-ink pb-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-8">
        {Array.from({ length: 2 }).map((_, panel) => (
          <div
            key={panel}
            className="flex flex-col gap-4 border-2 border-ink bg-surface p-5 shadow-hard md:p-6"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex justify-end pt-2">
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
