"use client";

import type { ComponentProps, CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import type { KioskElementsConfig } from "@/lib/kiosk-elements";
import { KioskElement } from "@/components/kiosk/KioskElement";

/**
 * Primitive visual kiosk: satu kontrak spacing, tipografi, border, dan state
 * untuk seluruh layar customer. Komponen ini hanya presentasional — state,
 * API, dan alur tetap di masing-masing layar.
 */

export const KIOSK_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Gutter horizontal aman: hormati setelan owner, tetapi dijaga pada rentang
 * 16–48px. Batas atas mencegah padding owner yang ekstrem (≤96px) menyisakan
 * konten terlalu sempit di layar 360px sehingga memicu overflow horizontal.
 */
export function kioskGutter(padding: number | undefined): number {
  return Math.min(48, Math.max(16, padding ?? 24));
}

/**
 * Kontrak isian (input/select/textarea) kiosk. Satu sumber kelas supaya border,
 * tinggi target 44px, dan focus ring tidak diduplikasi di tiap layar.
 */
export const KIOSK_FIELD =
  "min-h-11 w-full min-w-0 border-2 border-ink px-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50";

/**
 * Isian tanpa border/latar sendiri — untuk input di dalam wrapper yang sudah
 * ber-border (mis. search field dengan ikon). Fokus ditampilkan oleh wrapper
 * lewat `focus-within`.
 */
export const KIOSK_FIELD_BARE =
  "h-11 w-full min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50";

/**
 * Tombol papan ketik layar sentuh. `min-w-11` (44px) + `flex-wrap` pemanggil
 * menjamin target tetap 44px walau viewport menyempit.
 */
export const KIOSK_PAD_KEY =
  "inline-flex min-h-11 min-w-11 flex-1 items-center justify-center border-2 border-ink bg-surface px-1 font-display text-base font-bold uppercase leading-none tracking-[-0.01em] shadow-hard-sm transition-transform duration-150 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50";

/**
 * Ukuran judul responsif yang tetap menghormati `font_scale` owner.
 * `calc(clamp(...) * scale)` menjaga judul tidak pernah memaksa overflow.
 */
export function kioskFont(min: number, max: number, scale = 1, vw = 3.4): string {
  return `calc(clamp(${min}rem, ${vw}vw, ${max}rem) * ${scale})`;
}

export function KioskEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "font-mono text-[10px] font-bold uppercase leading-none tracking-[0.24em] text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}

type HeadingSize = "sm" | "md" | "lg";

const HEADING_SIZES: Record<HeadingSize, (scale: number) => string> = {
  sm: (scale) => kioskFont(1.35, 1.9, scale, 2.6),
  md: (scale) => kioskFont(1.75, 2.75, scale, 3.2),
  lg: (scale) => kioskFont(2.25, 4, scale, 4.6),
};

export function KioskHeading({
  as: Tag = "h1",
  size = "md",
  scale = 1,
  className,
  style,
  children,
}: {
  as?: ElementType;
  size?: HeadingSize;
  scale?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "font-display uppercase leading-[0.92] tracking-[-0.02em] text-balance",
        className
      )}
      style={{ fontSize: HEADING_SIZES[size](scale), ...style }}
    >
      {children}
    </Tag>
  );
}

/**
 * Header layar: eyebrow + judul + deskripsi + aksi. Garis bawah memisahkan
 * konteks dari konten tanpa menambah kartu baru.
 */
export function KioskHeader({
  eyebrow,
  title,
  description,
  actions,
  align = "left",
  scale = 1,
  size = "md",
  className,
  elements,
  elementIds,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  align?: "left" | "center" | "right";
  scale?: number;
  size?: HeadingSize;
  className?: string;
  /** Konfigurasi elemen kiosk (visibilitas/urutan/geser per bagian). */
  elements?: KioskElementsConfig;
  /** Id elemen untuk tiap bagian header — hanya bagian yang diberi id dibungkus. */
  elementIds?: { eyebrow?: string; title?: string; description?: string; actions?: string };
}) {
  // Bungkus hanya saat layar benar-benar memakai konfigurasi elemen; layar lain
  // tetap mendapat markup header lama tanpa div tambahan.
  const wrap =
    elementIds || elements
      ? (node: ReactNode, fallbackId: string, order: number) => (
          <KioskElement id={fallbackId} defaultOrder={order} elements={elements}>
            {node}
          </KioskElement>
        )
      : (_node: ReactNode) => _node;
  const eyebrowNode = eyebrow
    ? wrap(<KioskEyebrow>{eyebrow}</KioskEyebrow>, elementIds?.eyebrow ?? "eyebrow", 0)
    : null;
  const titleNode = wrap(
    <KioskHeading size={size} scale={scale}>
      {title}
    </KioskHeading>,
    elementIds?.title ?? "title",
    1
  );
  const descriptionNode = description
    ? wrap(
        <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground md:text-base">
          {description}
        </p>,
        elementIds?.description ?? "hint",
        2
      )
    : null;
  const actionsNode = actions ? wrap(actions, elementIds?.actions ?? "actions", 3) : null;
  const alignClass =
    align === "center"
      ? "items-center text-center"
      : align === "right"
        ? "items-end text-right"
        : "items-start text-left";
  return (
    <header
      className={cn(
        "flex w-full flex-col gap-4 border-b-2 border-ink/15 pb-5 md:flex-row md:items-end md:justify-between md:gap-6",
        className
      )}
    >
      <div className={cn("flex min-w-0 flex-col gap-2.5", alignClass)}>
        {eyebrowNode}
        {titleNode}
        {descriptionNode}
      </div>
      {actionsNode ? (
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-2",
            align === "center"
              ? "justify-center"
              : align === "right"
                ? "justify-end"
                : "justify-start"
          )}
        >
          {actionsNode}
        </div>
      ) : null}
    </header>
  );
}

export function KioskCard({
  children,
  className,
  elevated = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** Hard shadow hanya untuk kartu yang memang membawa hierarki aksi. */
  elevated?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("border-2 border-ink bg-surface", elevated && "shadow-hard", className)}
      style={style}
    >
      {children}
    </div>
  );
}

type ActionTone = "primary" | "secondary" | "ghost" | "danger";
type ActionSize = "sm" | "md" | "lg" | "xl" | "icon";

const ACTION_SIZES: Record<ActionSize, string> = {
  sm: "min-h-11 px-3 py-2 text-xs",
  md: "min-h-12 px-4 py-2.5 text-sm",
  lg: "min-h-14 px-6 py-3 text-base",
  xl: "min-h-16 px-8 py-4 text-lg md:text-xl",
  icon: "size-12 p-0",
};

/**
 * Kontrak tombol kiosk customer. Berbeda dari primitif dashboard
 * (`ui/button` = kontrol sistem, sans, hard shadow 2px) karena aksi customer
 * memakai font display uppercase dan target ≥44px. Perbedaan ini disengaja:
 * satu permukaan customer, satu permukaan sistem. Keduanya memakai token
 * `shadow-hard`/`shadow-hard-sm` dan border 2px yang sama.
 */
const ACTION_TONES: Record<ActionTone, string> = {
  primary:
    "border-ink bg-accent text-ink shadow-hard hover:shadow-hard-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  secondary:
    "border-ink bg-surface text-ink shadow-hard-sm hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  ghost: "border-transparent bg-transparent text-ink hover:bg-muted",
  danger:
    "border-destructive bg-destructive text-destructive-foreground shadow-hard-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
};

export function KioskAction({
  tone = "secondary",
  size = "md",
  kioskStyle,
  full = false,
  className,
  style,
  type = "button",
  children,
  ...props
}: ComponentProps<"button"> & {
  tone?: ActionTone;
  size?: ActionSize;
  kioskStyle?: KioskVisualStyle;
  full?: boolean;
}) {
  const accent =
    tone === "primary" && kioskStyle
      ? {
          backgroundColor: kioskStyle.accent,
          color: kioskStyle.accentText,
          borderRadius: kioskStyle.radius,
        }
      : kioskStyle
        ? { borderRadius: kioskStyle.radius }
        : undefined;
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 border-2 font-display font-bold uppercase leading-none tracking-[-0.01em] transition-[transform,box-shadow,background-color] duration-150 disabled:pointer-events-none disabled:opacity-50",
        KIOSK_FOCUS,
        ACTION_SIZES[size],
        ACTION_TONES[tone],
        full && "w-full",
        className
      )}
      style={{ ...accent, ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export function KioskChip({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border-2 border-ink bg-bg px-2.5 py-1 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.1em]",
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
}

/** Skeleton loading bersama (DESIGN.md §4: skeletal, bukan spinner generik). */
export function KioskLoading({
  label = "Memuat",
  rows = 3,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("flex w-full flex-col gap-2", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: Math.max(1, rows) }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="block h-11 w-full animate-pulse border-2 border-ink/15 bg-muted"
        />
      ))}
    </div>
  );
}
