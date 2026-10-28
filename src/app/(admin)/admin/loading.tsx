import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton netral untuk seluruh segmen admin: hanya kerangka header + baris,
 * tanpa mengklaim bentuk (grid stat / tabel) yang belum tentu dimiliki halaman
 * tujuan. Segmen yang bentuknya khas punya loading.tsx sendiri.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 border-2 border-ink/10" />
        ))}
      </div>
    </div>
  );
}
