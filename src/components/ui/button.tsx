"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button-variants";

import { cn } from "@/lib/utils";

/**
 * Button — Neo-Brutalism: border 2px ink, hard shadow, mono, radius 0.
 * Varian & ukuran tunggal di `button-variants.ts` (dipakai juga untuk <Link>).
 */

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button };
