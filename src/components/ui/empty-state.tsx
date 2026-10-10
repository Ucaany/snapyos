import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  eyebrow,
  title,
  body,
  cta,
  icon: Icon,
  align = "start",
  size = "md",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  cta?: ReactNode;
  icon?: LucideIcon;
  align?: "start" | "center";
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex flex-col border-2 border-dashed border-ink/40 bg-muted",
        align === "center" ? "items-center text-center" : "items-start",
        size === "sm" ? "gap-3 p-6" : "gap-4 p-8"
      )}
    >
      {Icon && <Icon className="size-8" aria-hidden />}
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {"/// "}
        {eyebrow}
      </p>
      <p
        className={cn(
          "font-display uppercase tracking-tight",
          size === "sm" ? "text-base" : "text-lg"
        )}
      >
        {title}
      </p>
      {body && (
        <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      {cta && <div>{cta}</div>}
    </div>
  );
}
