"use client";

import type { CSSProperties, ReactNode } from "react";
import { resolveKioskElement, type KioskElementsConfig } from "@/lib/kiosk-elements";

/**
 * Pembungkus satu elemen layar kiosk: menyembunyikan sesuai setelan owner dan
 * menerapkan urutan/geser. `hidden` dipakai (bukan `display`) agar atribut
 * aksesibilitas tetap benar.
 */
export function KioskElement({
  id,
  defaultOrder,
  elements,
  children,
  className,
  style,
}: {
  id: string;
  defaultOrder: number;
  elements?: KioskElementsConfig;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { hidden, style: layoutStyle } = resolveKioskElement(elements, id, defaultOrder);
  // `hidden` attribute saja kalah oleh kelas Tailwind `flex`/`grid` pada wrapper
  // (display dari kelas menimpa UA `display:none`). Inline `display:none` menang
  // atas kelas; atribut `hidden` tetap dipasang untuk aksesibilitas. `style` boleh
  // menimpa properti lain, tapi tidak boleh memunculkan kembali elemen tersembunyi.
  const mergedStyle: CSSProperties = { ...layoutStyle, ...style };
  if (hidden) mergedStyle.display = "none";
  return (
    <div
      data-kiosk-element={id}
      hidden={hidden}
      className={className}
      style={mergedStyle}
    >
      {children}
    </div>
  );
}

