import { cn } from "@/lib/utils";
import type React from "react";

export type LinkItemType = {
  label: string;
  href: string;
  icon: React.ReactNode;
  description?: string;
};

export function LinkItem({
  label,
  description,
  icon,
  className,
  href,
  ...props
}: React.ComponentProps<"a"> & LinkItemType) {
  return (
    <a className={cn("flex items-center gap-x-2", className)} href={href} {...props}>
      <div
        className={cn(
          "flex aspect-square size-12 items-center justify-center rounded-none border-2 border-ink bg-surface text-sm shadow-[2px_2px_0_0_#111111]",
          "[&_svg:not([class*='size-'])]:size-5 [&_svg:not([class*='size-'])]:text-foreground"
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col items-start justify-center">
        <span className="font-medium">{label}</span>
        <span className="line-clamp-2 text-muted-foreground text-xs">{description}</span>
      </div>
    </a>
  );
}
