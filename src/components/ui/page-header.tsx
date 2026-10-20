import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  right,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  // Shared /// eyebrow creates one operational dashboard voice and separates context from task title.
  return (
    <header className="space-y-2">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {"/// "}
        {eyebrow}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-black uppercase tracking-tight md:text-5xl">
          {title}
        </h1>
        {right}
      </div>
      {description && (
        <p className="max-w-[65ch] font-mono text-sm text-muted-foreground">{description}</p>
      )}
      {meta && (
        <div className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {meta}
        </div>
      )}
    </header>
  );
}
