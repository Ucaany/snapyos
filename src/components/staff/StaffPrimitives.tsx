import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function StaffPanel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]",
        className
      )}
      {...props}
    />
  );
}

export function StaffPanelHeader({
  label,
  meta,
  className,
}: {
  label: string;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-2 border-ink bg-ink px-4 py-2.5 text-bg",
        className
      )}
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">{label}</p>
      {meta ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bg/75">{meta}</p>
      ) : null}
    </div>
  );
}

export function StaffPageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <header className="grid gap-5 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="min-w-0">
        <p className="inline-flex border-2 border-ink bg-accent px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink">
          {eyebrow}
        </p>
        <h1 className="mt-3 font-display text-3xl uppercase leading-[0.95] tracking-[-0.03em] sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        <p className="mt-3 max-w-[65ch] font-mono text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {description}
        </p>
      </div>
      {aside ? <div className="min-w-0 md:justify-self-end">{aside}</div> : null}
    </header>
  );
}

export function StaffMetric({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string | number;
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn("border-2 border-ink bg-bg px-3 py-2", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold leading-none">
        {typeof value === "number" ? String(value).padStart(2, "0") : value}
      </p>
      {note ? (
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function StaffMeta({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 min-w-0 font-mono text-xs leading-snug text-ink">{children}</dd>
    </div>
  );
}

export function StaffEmptyState({
  icon: Icon,
  eyebrow,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-2 border-dashed border-ink/40 bg-muted p-5 sm:p-6">
      {Icon ? <Icon className="size-7" aria-hidden /> : null}
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">{eyebrow}</p>
      <p className="max-w-[42ch] font-display text-lg uppercase leading-tight tracking-tight">
        {title}
      </p>
      <p className="max-w-[60ch] font-mono text-xs leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action}
    </div>
  );
}
