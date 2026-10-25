"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { modernBadge, modernBadgeVariants } from "@/components/ui/modern-classes";
import { cn } from "@/lib/utils";

/**
 * Badge — dua tema. Brutalis (default): kotak border 2px, mono, uppercase.
 * Modern: pill default shadcn base-nova (rounded-4xl, text-xs, font-medium).
 */

const brutalistBadgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-none border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.08em] whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-ink has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-accent text-ink [a]:hover:bg-accent",
        secondary: "bg-ink text-bg [a]:hover:bg-ink",
        destructive:
          "border-destructive bg-destructive/10 text-destructive [a]:hover:bg-destructive/20",
        outline: "border-ink bg-surface text-ink [a]:hover:bg-muted",
        ghost: "border-transparent bg-transparent hover:bg-muted hover:text-ink",
        link: "border-transparent bg-transparent text-ink underline-offset-4 hover:underline",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const modernBadgeCva = cva(modernBadge, {
  variants: {
    variant: {
      default: modernBadgeVariants.default,
      secondary: modernBadgeVariants.secondary,
      destructive: modernBadgeVariants.destructive,
      outline: modernBadgeVariants.outline,
      ghost: modernBadgeVariants.ghost,
      link: modernBadgeVariants.link,
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof brutalistBadgeVariants>) {
  const modern = useIsModernTheme();
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          modern ? modernBadgeCva({ variant }) : brutalistBadgeVariants({ variant }),
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge, brutalistBadgeVariants as badgeVariants };
