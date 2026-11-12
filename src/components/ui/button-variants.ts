import { cva } from "class-variance-authority";

/**
 * Varian tombol brutalis untuk pemakaian non-komponen (`buttonVariants()` pada
 * <Link>). Modul ini sengaja TANPA "use client" agar bisa dipanggil dari
 * server component — komponen <Button /> sendiri ada di `button.tsx`.
 */
export const buttonVariants = cva(
  "group/button inline-flex min-h-11 shrink-0 items-center justify-center rounded-none border-2 border-ink bg-clip-padding text-sm font-bold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-0 active:not-aria-[haspopup]:translate-x-[2px] active:not-aria-[haspopup]:translate-y-[2px] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-ink shadow-hard-sm hover:bg-accent/85 active:shadow-none",
        outline: "bg-surface text-ink shadow-hard-sm hover:bg-bg active:shadow-none",
        secondary: "bg-ink text-bg hover:bg-ink/85 active:shadow-none",
        ghost:
          "border-transparent bg-transparent shadow-none hover:bg-muted hover:text-ink aria-expanded:bg-muted aria-expanded:text-ink",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 active:shadow-none",
        link: "border-transparent bg-transparent text-ink underline-offset-4 hover:underline shadow-none",
      },
      size: {
        default: "h-11 min-h-11 gap-1.5 px-3",
        sm: "h-11 min-h-11 gap-1 px-2.5 text-[0.8rem]",
        lg: "h-12 min-h-12 gap-1.5 px-4 text-base",
        icon: "size-11 min-h-11 min-w-11",
        "icon-compact":
          "relative size-9 min-h-9! min-w-9! after:absolute after:-inset-1 after:content-['']",
        "icon-sm": "size-11 min-h-11 min-w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
