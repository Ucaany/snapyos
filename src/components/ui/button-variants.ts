import { cva } from "class-variance-authority";

/**
 * Varian tombol neobrutalism.dev untuk pemakaian non-komponen
 * (`buttonVariants()` pada <Link>). Modul ini sengaja TANPA "use client" agar
 * bisa dipanggil dari server component — komponen <Button /> sendiri ada di
 * `button.tsx`.
 *
 * Varian registry: default, noShadow, neutral, reverse.
 * Ekstensi SnapyOS: destructive, ghost, link (aksi berbahaya / teks / transparan).
 */
export const buttonVariants = cva(
  "relative inline-flex items-center justify-center whitespace-nowrap rounded-base text-sm font-base ring-offset-white transition-all gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "text-main-foreground bg-main border-2 border-border shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        noShadow: "text-main-foreground bg-main border-2 border-border",
        neutral:
          "bg-secondary-background text-foreground border-2 border-border shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        reverse:
          "text-main-foreground bg-main border-2 border-border hover:translate-x-reverseBoxShadowX hover:translate-y-reverseBoxShadowY hover:shadow-shadow",
        destructive:
          "bg-destructive text-destructive-foreground border-2 border-border shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        ghost: "border-2 border-transparent bg-transparent text-foreground hover:bg-muted",
        link: "border-2 border-transparent bg-transparent text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-8 gap-1.5 px-2.5 text-xs after:absolute after:-inset-1.5 after:content-[''] [&_svg]:size-3.5",
        sm: "h-9 px-3 after:absolute after:-inset-1.5 after:content-['']",
        lg: "h-11 px-8",
        icon: "size-10",
        "icon-xs": "size-8 after:absolute after:-inset-1.5 after:content-[''] [&_svg]:size-3.5",
        "icon-sm": "size-9 after:absolute after:-inset-1.5 after:content-['']",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
