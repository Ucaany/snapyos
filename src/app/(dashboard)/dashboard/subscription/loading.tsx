import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingSubscription() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-[50ch] max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Skeleton className="h-64 lg:col-span-7" />
        <Skeleton className="h-64 lg:col-span-5" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
