"use client";

import * as React from "react";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { modernCard } from "@/components/ui/modern-classes";
import { cn } from "@/lib/utils";

/**
 * Card — dua tema.
 * Brutalis (default): border 2px ink, hard shadow, radius 0.
 * Modern: kelas default shadcn base-nova (ring 1px, rounded-xl, bg-card).
 * Pemilihan lewat context; pemakaian di luar shell dashboard (marketing,
 * auth, kiosk, POS) tetap brutalis karena context default-nya brutalist.
 */

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  const modern = useIsModernTheme();
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        modern
          ? cn(modernCard.card, className)
          : cn(
              "flex flex-col gap-4 border-2 border-ink bg-surface p-5 text-ink shadow-[4px_4px_0_0_#111111]",
              className
            )
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  const modern = useIsModernTheme();
  return (
    <div
      data-slot="card-header"
      className={cn(modern ? modernCard.header : "flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  const modern = useIsModernTheme();
  return (
    <div
      data-slot="card-title"
      className={cn(
        modern
          ? modernCard.title
          : "font-display text-lg font-bold uppercase leading-none tracking-tight",
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  const modern = useIsModernTheme();
  return (
    <div
      data-slot="card-description"
      className={cn(modern ? modernCard.description : "text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  const modern = useIsModernTheme();
  return (
    <div
      data-slot="card-action"
      className={cn(modern ? modernCard.action : "self-start", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  const modern = useIsModernTheme();
  return (
    <div
      data-slot="card-content"
      className={cn(modern ? modernCard.content : undefined, className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  const modern = useIsModernTheme();
  return (
    <div
      data-slot="card-footer"
      className={cn(
        modern ? modernCard.footer : "flex items-center border-t-2 border-ink pt-4",
        className
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
