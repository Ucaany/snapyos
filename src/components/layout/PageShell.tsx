import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Container standar halaman dashboard: satu kolom, jarak antar-blok konsisten,
 * padding aman di 320-390px.
 *
 * Pengecualian DESIGN.md §5 (p-6 md:p-10): nilai `p-4 sm:p-6 md:p-10` adalah
 * kontrak yang benar-benar dipakai di seluruh dashboard; menaikkan padding
 * mobile ke 24px mempersempit konten di layar 320px.
 */
export function PageShell({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-6 p-4 sm:p-6 md:gap-8 md:p-10", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
