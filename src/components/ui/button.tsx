"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button-variants";

import { cn } from "@/lib/utils";

/**
 * Button — neobrutalism.dev (Base UI): border 2px, hard shadow, hover
 * translate sebesar offset shadow. Varian & ukuran tunggal di
 * `button-variants.ts` (dipakai juga untuk <Link> dari server component).
 */
function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ButtonPrimitive> & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
