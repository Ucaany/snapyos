"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Collapsible — Base UI, dikustomisasi Neo-Brutalism (docs/11 §11.5).
 * Trigger = tombol header panel; Panel = konten collapsible.
 */

function Collapsible(props: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

/**
 * Satu bentuk trigger untuk SEMUA panel collapsible dashboard: ikon + label
 * sr-only dari pemanggil, chevron bawaan yang berputar saat panel terbuka.
 * Padding/tinggi tidak di-override per halaman agar baris aksi tidak bergeser.
 */
function CollapsibleTrigger({ className, children, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-none border-2 border-ink bg-surface px-3 font-mono text-xs font-bold uppercase tracking-[0.05em] text-ink shadow-hard outline-none transition-all duration-100 select-none hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm active:translate-x-[4px] active:translate-y-[4px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className="size-4 transition-transform duration-100 [[data-panel-open]_&]:rotate-180"
        aria-hidden
      />
    </CollapsiblePrimitive.Trigger>
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
