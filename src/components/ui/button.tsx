"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { buttonVariants as brutalistButtonVariants } from "@/components/ui/button-variants";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";
import { modernButton, modernButtonSizes, modernButtonVariants } from "@/components/ui/modern-classes";
import { cn } from "@/lib/utils";

/**
 * Button — dua tema. Brutalis (default): border 2px ink, hard shadow, mono.
 * Modern: kelas default shadcn base-nova (rounded-lg, border 1px, font-medium).
 */

const modernButtonCva = cva(modernButton, {
  variants: {
    variant: {
      default: modernButtonVariants.default,
      outline: modernButtonVariants.outline,
      secondary: modernButtonVariants.secondary,
      ghost: modernButtonVariants.ghost,
      destructive: modernButtonVariants.destructive,
      link: modernButtonVariants.link,
    },
    size: {
      default: modernButtonSizes.default,
      xs: modernButtonSizes.xs,
      sm: modernButtonSizes.sm,
      lg: modernButtonSizes.lg,
      icon: modernButtonSizes.icon,
      "icon-xs": modernButtonSizes["icon-xs"],
      "icon-sm": modernButtonSizes["icon-sm"],
      "icon-lg": modernButtonSizes["icon-lg"],
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof brutalistButtonVariants>) {
  const modern = useIsModernTheme();
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        modern
          ? modernButtonCva({ variant, size })
          : brutalistButtonVariants({ variant, size }),
        className
      )}
      {...props}
    />
  );
}

export { Button };
