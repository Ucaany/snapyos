import { Skeleton } from "@/components/ui/skeleton";

/** Bentuk /admin/settings: header + tiga card form. */
export default function AdminSettingsLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-72" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-48 border-2 border-ink/10" />
      ))}
    </div>
  );
}
