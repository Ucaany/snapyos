import { Skeleton } from "@/components/admin/ui/skeleton";

/** Skeleton builder admin: header + kanvas preview + panel kontrol. */
export default function AdminTemplateBuilderLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-52" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Skeleton className="mx-auto aspect-3/4 w-full max-w-[420px]" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      </div>
    </div>
  );
}
