"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Slider neobrutalist: track border 2px ink, radius 0, target 44px. */
export function Slider({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="range"
      data-slot="slider"
      className={cn(
        "h-11 w-full cursor-pointer appearance-none rounded-none border-2 border-ink bg-surface accent-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
