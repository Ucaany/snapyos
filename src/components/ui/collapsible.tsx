"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "@/lib/utils";

/**
 * Collapsible — Base UI, dikustomisasi Neo-Brutalism (docs/11 §11.5).
 * Trigger = tombol header panel; Panel = konten collapsible.
 */

function Collapsible(props: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-none border-2 border-ink bg-surface font-mono text-xs font-bold uppercase tracking-[0.05em] text-ink shadow-[4px_4px_0_0_#111111] outline-none transition-all duration-100 select-none hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#111111] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
        className
      )}
      {...props}
    />
  );
}

function CollapsiblePanel({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel };
