import { Skeleton } from "@/components/admin/ui/skeleton";

/** Bentuk /admin/payments: header + filter + metrik + panel status dan daftar. */
export default function AdminPaymentsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-72" />
      </div>
      <Skeleton className="h-9 w-full max-w-2xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Skeleton className="h-72 rounded-xl xl:col-span-4" />
        <Skeleton className="h-72 rounded-xl xl:col-span-8" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
