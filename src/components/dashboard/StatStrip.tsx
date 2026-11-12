import { cn } from "@/lib/utils";

/**
 * StatStrip — deretan metrik ringkas.
 * Neo-Brutalism: grid "blueprint" gap 2px dengan latar ink sebagai garis.
 */
export function StatStrip({
  items,
  columns = 4,
  label,
}: {
  items: { label: string; value: string; tone?: string }[];
  columns?: 4 | 6 | 8 | 9;
  label: string;
}) {
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink shadow-hard",
        columns === 4 && "md:grid-cols-4",
        columns === 6 && "sm:grid-cols-3 lg:grid-cols-6",
        columns === 8 && "grid-cols-3 sm:grid-cols-4 xl:grid-cols-8",
        columns === 9 && "grid-cols-2 sm:grid-cols-3"
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-2 bg-surface p-3">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className={cn("font-mono text-sm font-bold leading-none md:text-base", item.tone)}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
