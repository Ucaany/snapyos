"use client";

import type { ComponentProps, CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { KioskVisualStyle } from "@/lib/kiosk-types";

/**
 * Primitive visual kiosk: satu kontrak spacing, tipografi, border, dan state
 * untuk seluruh layar customer. Komponen ini hanya presentasional — state,
 * API, dan alur tetap di masing-masing layar.
 */

export const KIOSK_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Gutter horizontal aman: hormati setelan owner, tetapi jangan sampai 0px. */
export function kioskGutter(padding: number | undefined): number {
  return Math.max(16, padding ?? 24);
}

/**
 * Ukuran judul responsif yang tetap menghormati `font_scale` owner.
 * `calc(clamp(...) * scale)` menjaga judul tidak pernah memaksa overflow.
 */
export function kioskFont(min: number, max: number, scale = 1, vw = 3.4): string {
  return `calc(clamp(${min}rem, ${vw}vw, ${max}rem) * ${scale})`;
}

export function KioskEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
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
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  align?: "left" | "center" | "right";
  scale?: number;
  size?: HeadingSize;
  className?: string;
}) {
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
        {eyebrow ? <KioskEyebrow>{eyebrow}</KioskEyebrow> : null}
        <KioskHeading size={size} scale={scale}>
          {title}
        </KioskHeading>
        {description ? (
          <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-2",
            align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"
          )}
        >
          {actions}
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
      className={cn(
        "border-2 border-ink bg-surface",
        elevated && "shadow-[4px_4px_0_0_#111111]",
        className
      )}
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

const ACTION_TONES: Record<ActionTone, string> = {
  primary:
    "border-ink bg-accent text-ink shadow-[4px_4px_0_0_#111111] hover:shadow-[2px_2px_0_0_#111111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  secondary:
    "border-ink bg-surface text-ink shadow-[3px_3px_0_0_#111111] hover:shadow-[1px_1px_0_0_#111111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  ghost: "border-transparent bg-transparent text-ink hover:bg-muted",
  danger:
    "border-destructive bg-destructive text-destructive-foreground shadow-[3px_3px_0_0_#111111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
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

/** Kerangka layar: satu sumbu scroll internal, gutter dari setelan owner. */
export function KioskScreen({
  children,
  className,
  style,
  gutter,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  gutter?: number;
}) {
  return (
    <div
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-y-auto", className)}
      style={{ paddingLeft: gutter, paddingRight: gutter, ...style }}
    >
      {children}
    </div>
  );
}
