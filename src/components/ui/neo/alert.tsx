"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  info: "border-ink bg-surface text-ink",
  success: "border-ink bg-accent-3 text-ink",
  warning: "border-ink bg-accent text-ink",
  danger: "border-destructive bg-surface text-ink",
} as const;

export type AlertTone = keyof typeof TONES;

/** Callout neobrutalist: border 2px, hard shadow, radius 0. */
export function Alert({
  tone = "info",
  className,
  children,
  ...props
}: ComponentProps<"div"> & { tone?: AlertTone }) {
  return (
    <div
      data-slot="alert"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-1 border-2 p-3 font-mono text-xs leading-relaxed shadow-hard-sm",
        TONES[tone],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
