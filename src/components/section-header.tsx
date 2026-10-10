import { Badge } from "@/components/ui/badge";

export function SectionHeader({
  badge,
  title,
  subtitle,
  compact = false,
}: {
  badge: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Badge variant="secondary" className="w-fit">
        {badge}
      </Badge>
      <h2
        className={
          compact
            ? "text-3xl font-medium tracking-tight text-foreground sm:text-4xl"
            : "text-3xl font-medium tracking-tight text-foreground sm:text-4xl"
        }
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={
            compact
              ? "max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7"
              : "max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7"
          }
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
