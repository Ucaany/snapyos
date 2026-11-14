"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/admin/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/admin/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Disclosure polos (tanpa Card) untuk dipakai DI DALAM Card supaya tidak ada
 * kartu di dalam kartu. Chevron memakai `group-data-[panel-open]` karena
 * atribut `data-panel-open` ada di trigger, bukan di ikon.
 */
export function AdminDisclosure({
  trigger,
  children,
  defaultOpen = false,
  className,
  triggerClassName,
  contentClassName,
}: {
  trigger: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("min-w-0", className)}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between gap-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          triggerClassName
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{trigger}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn("pt-3", contentClassName)}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Kartu ringkasan yang bisa dibuka. Memakai shadcn Card + Collapsible, jadi
 * tidak ada lagi `<details>` mentah di halaman admin.
 */
export function AdminDisclosureCard({
  trigger,
  children,
  defaultOpen = false,
  className,
  contentClassName,
}: {
  trigger: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger className="group flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{trigger}</span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-180"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn("border-t px-4 py-4", contentClassName)}>{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
