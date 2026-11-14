import { Skeleton } from "@/components/admin/ui/skeleton";

/** Bentuk /admin/plans dan /admin/templates: form panjang + daftar. */
export default function AdminFormListLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-64" />
      </div>
      <Skeleton className="h-56" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
