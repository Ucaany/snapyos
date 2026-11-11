"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

export type { CalendarProps } from "./calendar-inner";

/**
 * Calendar — wrapper dynamic import untuk react-day-picker.
 * Bundle-heavy (locale + DayPicker + internal state machine) sehingga tidak
 * dimuat sampai user benar-benar buka DateRangeFilter atau komponen sejenis.
 */
export const Calendar = dynamic(() => import("./calendar-inner").then((mod) => mod.Calendar), {
  ssr: false,
  loading: () => (
    <Skeleton className="h-72 w-64 border-2 border-ink shadow-hard" />
  ),
});
