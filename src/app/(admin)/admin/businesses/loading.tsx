import { Skeleton } from "@/components/ui/skeleton";

/** Bentuk /admin/businesses: header + filter + tabel lebar. */
export default function AdminBusinessesLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72" />
      </div>
      <Skeleton className="h-11 w-full max-w-xl" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 border-2 border-ink/10" />
        ))}
      </div>
    </div>
  );
}
