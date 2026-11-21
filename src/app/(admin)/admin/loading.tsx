import { Skeleton } from "@/components/admin/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Memuat halaman admin">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[108px] rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
