import { Skeleton } from "@/components/admin/ui/skeleton";

/** Bentuk /admin/settings: header + metrik + dua card form. */
export default function AdminSettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-xl" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-48" />
      ))}
    </div>
  );
}
