"use client";

import * as React from "react";
import {
  Accordion as AccordionPrimitive,
} from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Catatan: tidak ada prop `collapsible` (beda dari Radix). Accordion Base UI
// mode `single` selalu bisa ditutup — lihat `AccordionRoot.handleValueChange`
// (`value[0] === newValue ? [] : [newValue]`) — jadi prop itu tidak akan
// mengubah apa pun kalau diteruskan.
function Accordion({
  className,
  type,
  defaultValue,
  ...props
}: Omit<React.ComponentProps<typeof AccordionPrimitive.Root>, "defaultValue"> & {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
}) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("w-full", className)}
      multiple={type === "multiple"}
      keepMounted
      defaultValue={
        defaultValue === undefined
          ? undefined
          : Array.isArray(defaultValue)
            ? defaultValue
            : [defaultValue]
      }
      {...props}
    />
  );
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b-2 border-ink", className)}
      {...props}
    />
  );
}

function AccordionHeader({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Header>) {
  return (
    <AccordionPrimitive.Header
      data-slot="accordion-header"
      className={cn("flex", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Trigger
      data-slot="accordion-trigger"
      className={cn(
        "flex flex-1 items-center justify-between gap-4 rounded-none py-4 text-left text-sm font-bold uppercase tracking-[0.04em] outline-none transition-all hover:text-ink focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-50 [&[data-panel-open]>svg]:rotate-180",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown
        data-slot="accordion-icon"
        className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200"
      />
    </AccordionPrimitive.Trigger>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Panel>) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "grid grid-rows-[0fr] overflow-hidden text-sm transition-all data-open:grid-rows-[1fr]",
        className
      )}
      {...props}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          data-slot="accordion-content-inner"
          className="pb-4 pt-0 text-muted-foreground"
        >
          {children}
        </div>
      </div>
    </AccordionPrimitive.Panel>
  );
}

export {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionContent,
};
