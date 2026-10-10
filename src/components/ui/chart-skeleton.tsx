import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Placeholder chart brutalist saat komponen Recharts dimuat dinamis. */
export function ChartSkeleton({
  className,
  height = "h-[280px]",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <Skeleton
      className={cn("w-full border-2 border-ink shadow-[4px_4px_0_0_#111111]", height, className)}
    />
  );
}
