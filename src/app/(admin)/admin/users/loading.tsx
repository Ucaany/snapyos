import { Skeleton } from "@/components/ui/skeleton";

/** Bentuk /admin/users: header + form tambah + tabel lebar. */
export default function AdminUsersLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-64" />
      </div>
      <Skeleton className="h-32 border-2 border-ink/10" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 border-2 border-ink/10" />
        ))}
      </div>
    </div>
  );
}
