"use client";

import * as React from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { id } from "react-day-picker/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type CalendarProps = DayPickerProps;

/**
 * Calendar — react-day-picker v10 (basis shadcn/ui Calendar), dikustomisasi
 * Neo-Brutalism: flat, border 2px ink, hard shadow, radius 0, locale id-ID.
 *
 * Layout v10: `months` membungkus `nav` + N bulan. Nav di-overlay absolute
 * sejajar baris caption bulan pertama (panah kiri-kanan, caption di tengah).
 * Bulan berdampingan >=sm, tersusun vertikal di bawahnya.
 */

const NAV_BUTTON =
  "inline-flex size-8 cursor-pointer items-center justify-center border-2 border-ink bg-surface text-ink shadow-hard-sm outline-none transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-2xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40";

export function Calendar({
  className,
  components,
  locale = id,
  classNames,
  ...props
}: CalendarProps) {
  const defaultComponents = {
    Chevron: ({ orientation, ...rest }: { orientation?: string; className?: string }) =>
      orientation === "left" ? (
        <ChevronLeft className="size-4" aria-hidden {...rest} />
      ) : (
        <ChevronRight className="size-4" aria-hidden {...rest} />
      ),
    ...components,
  };

  return (
    <DayPicker
      locale={locale}
      components={defaultComponents}
      className={cn("w-max select-none p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-6 sm:flex-row sm:gap-8",
        month: "flex flex-col gap-3",
        nav: "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between [&>button]:pointer-events-auto",
        month_caption: "flex h-8 items-center justify-center border-b-2 border-ink",
        caption_label: "font-mono text-xs font-bold uppercase tracking-[0.12em] text-ink",
        button_previous: NAV_BUTTON,
        button_next: NAV_BUTTON,
        month_grid: "w-full border-collapse",
        weekdays: "flex gap-1",
        weekday:
          "flex size-9 items-center justify-center font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground",
        week: "mt-1 flex gap-1",
        day: "flex size-9 items-center justify-center p-0",
        day_button:
          "size-9 cursor-pointer border-2 border-transparent bg-transparent font-mono text-sm outline-none transition-colors hover:border-ink focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40",
        range_start: "",
        range_end: "",
        range_middle: "[&>button]:border-ink/30 [&>button]:bg-accent/40",
        selected:
          "[&>button]:border-ink [&>button]:bg-accent [&>button]:font-bold [&>button]:shadow-hard-sm",
        today:
          "[&>button]:font-bold [&>button]:underline [&>button]:decoration-2 [&>button]:underline-offset-4",
        outside: "text-muted-foreground/50",
        disabled: "opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
