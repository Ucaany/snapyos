import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true">
      <div className="flex flex-col gap-3 border-b-2 border-ink pb-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-32 w-full border-2 border-ink shadow-[4px_4px_0_0_#111111]"
          />
        ))}
      </div>
      <Skeleton className="h-48 w-full border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
      <Skeleton className="h-64 w-full border-2 border-ink shadow-[4px_4px_0_0_#111111]" />
    </div>
  );
}
