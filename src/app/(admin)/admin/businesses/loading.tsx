import { Skeleton } from "@/components/admin/ui/skeleton";

/** Bentuk /admin/businesses: header + filter + tabel lebar. */
export default function AdminBusinessesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}
