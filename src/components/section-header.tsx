import { Badge } from "@/components/ui/badge";

export function SectionHeader({
  badge,
  title,
  subtitle,
}: {
  badge: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Badge variant="secondary" className="w-fit">
        {badge}
      </Badge>
      <h2 className="font-display text-3xl font-black uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
          {subtitle}
        </p>
      )}
    </div>
  );
}
