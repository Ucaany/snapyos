"use client";

import * as React from "react";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { modernTable } from "@/components/ui/modern-classes";
import { cn } from "@/lib/utils";

/**
 * Table — dua tema. Brutalis (default): border 2px ink, header bar ink, mono.
 * Modern: kelas default shadcn base-nova (border-b 1px, header muted, text-sm).
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const modern = useIsModernTheme();
  return (
    <div
      data-slot="table-container"
      className={
        modern
          ? modernTable.container
          : "overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]"
      }
    >
      <table
        data-slot="table"
        className={cn(
          modern ? modernTable.table : "w-full border-collapse text-left",
          className
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  const modern = useIsModernTheme();
  return (
    <thead
      data-slot="table-header"
      className={cn(
        modern ? modernTable.header : "[&_tr]:border-b-2 [&_tr]:border-ink [&_tr]:bg-ink",
        className
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  const modern = useIsModernTheme();
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        modern ? modernTable.body : "[&_tr:last-child]:border-0",
        className
      )}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  const modern = useIsModernTheme();
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        modern
          ? modernTable.footer
          : "border-t-2 border-ink bg-muted font-mono text-xs uppercase tracking-[0.08em] [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  const modern = useIsModernTheme();
  return (
    <tr
      data-slot="table-row"
      className={cn(
        modern
          ? modernTable.row
          : "border-b-2 border-ink/10 transition-colors hover:bg-muted/60 last:border-b-0 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  const modern = useIsModernTheme();
  return (
    <th
      data-slot="table-head"
      className={cn(
        modern
          ? modernTable.head
          : "px-4 py-3.5 text-left align-middle font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  const modern = useIsModernTheme();
  return (
    <td
      data-slot="table-cell"
      className={cn(
        modern
          ? modernTable.cell
          : "px-4 py-3 align-middle font-mono text-xs text-ink [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  const modern = useIsModernTheme();
  return (
    <caption
      data-slot="table-caption"
      className={cn(modern ? modernTable.caption : "sr-only", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
