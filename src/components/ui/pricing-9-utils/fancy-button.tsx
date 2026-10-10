"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const fancyButtonVariants = cva(
  "group/fancy relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-none text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-2 border-ink bg-accent text-ink shadow-[2px_2px_0_0_#111111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function FancyButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof fancyButtonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="fancy-button"
      className={cn(fancyButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { FancyButton, fancyButtonVariants };
