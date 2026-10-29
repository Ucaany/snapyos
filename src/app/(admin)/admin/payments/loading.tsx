import { Skeleton } from "@/components/ui/skeleton";

/** Bentuk /admin/payments: header + filter + tiga card ringkasan. */
export default function AdminPaymentsLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-72" />
      </div>
      <Skeleton className="h-11 w-full max-w-2xl" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-44 border-2 border-ink/10" />
      ))}
    </div>
  );
}
