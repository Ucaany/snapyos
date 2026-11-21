import { Skeleton } from "@/components/admin/ui/skeleton";

/** Bentuk /admin/businesses/[id]: hero + KPI + profil + tabel booth. */
export default function AdminBusinessDetailLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Memuat detail bisnis">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-52" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Skeleton className="h-56 rounded-xl xl:col-span-7" />
          <Skeleton className="h-56 rounded-xl xl:col-span-5" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
