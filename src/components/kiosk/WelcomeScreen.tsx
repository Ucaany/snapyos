"use client";

import type { BrandingConfig, KioskBrandingConfig } from "@/lib/kiosk-types";
import { kioskThemeVars, kioskVisualStyle } from "@/lib/kiosk-types";
import { defaultBrandColors } from "@/lib/brand-defaults";
import { hexToRgba } from "@/lib/color";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import { KioskAction, KioskHeading, kioskGutter } from "@/components/kiosk/ui";

type Props = {
  business: { name: string; logo_url: string | null };
  branding: BrandingConfig;
  onStart: () => void;
};

/** Inisial monogram dari nama bisnis (maks 2 huruf) — bukan aset rekaan. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SF";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

/**
 * Welcome Screen — docs/05 §5.2. Satu layar penuh tanpa scroll di desktop;
 * di layar pendek konten tetap bisa digulir. Branding owner (warna, font scale,
 * radius, padding, visibilitas, video background looping ≤5s) dihormati.
 */
export function WelcomeScreen({ business, branding, onStart }: Props) {
  const k: KioskBrandingConfig = branding.kiosk ?? {};
  const title = branding.welcome_title || business.name;
  const tagline = branding.welcome_tagline || "Capture your moment.";
  const button = branding.welcome_button || "Mulai";
  const showLogo = k.show_logo !== false;
  const showTagline = k.show_tagline !== false;
  const vs = kioskVisualStyle(k, "welcome");
  const fontScale = vs.fontScale;
  const padding = kioskGutter(vs.padding);
  const secondary = branding.secondary_color || defaultBrandColors.ink;
  const primary = branding.primary_color || defaultBrandColors.accent;
  const layout = k.welcome_layout ?? "split-left";
  const videoUrl = k.pages?.welcome?.video_url ?? k.video_url ?? null;
  const contentAlign = vs.align ?? "center";
  const alignClass =
    contentAlign === "left"
      ? "items-start text-left"
      : contentAlign === "right"
        ? "items-end text-right"
        : "items-center text-center";

  const brandCol = (
    <div className="flex w-full flex-col items-center justify-center gap-5 text-center">
      {showLogo && business.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={business.logo_url}
          alt={`Logo ${business.name}`}
          className="max-h-24 w-auto max-w-[260px] object-contain md:max-h-32"
        />
      ) : (
        // Tanpa logo: monogram inisial dari nama bisnis sendiri (bukan aset
        // rekaan) supaya kolom brand punya jangkar visual, bukan ruang kosong.
        <span
          aria-hidden
          className="flex size-24 items-center justify-center border-2 border-ink font-display text-3xl font-bold uppercase leading-none tracking-[-0.04em] shadow-[6px_6px_0_0_#111111] md:size-32 md:text-4xl"
          style={{ backgroundColor: primary, color: secondary, borderRadius: vs.radius }}
        >
          {initials(business.name)}
        </span>
      )}
      {showLogo && business.logo_url ? (
        <p className="font-mono text-[10px] font-bold uppercase leading-none tracking-[0.3em] opacity-70">
          {business.name.toUpperCase()}
        </p>
      ) : null}
    </div>
  );

  // Judul default = nama bisnis; jika begitu, nama tidak diulang di kolom brand
  // (dua teks identik di satu layar hanya menambah noise).
  const titleIsBusiness = title.trim().toLowerCase() === business.name.trim().toLowerCase();

  const contentCol = (
    <div className={`flex min-w-0 flex-col justify-center gap-5 md:gap-6 ${alignClass}`}>
      {titleIsBusiness ? null : (
        <p className="font-mono text-[10px] font-bold uppercase leading-none tracking-[0.28em] opacity-60">
          {business.name.toUpperCase()}
        </p>
      )}
      <KioskHeading
        size="lg"
        scale={fontScale}
        className="max-w-[16ch]"
        style={{ color: secondary, fontFamily: vs.fontFamily }}
      >
        {title}
      </KioskHeading>
      {showTagline && (
        <p className="max-w-[40ch] text-base leading-relaxed opacity-80 md:text-lg">{tagline}</p>
      )}
      <KioskAction
        tone="primary"
        size="xl"
        onClick={onStart}
        className="mt-1 min-w-[220px] tracking-[-0.02em]"
        style={{
          backgroundColor: primary,
          borderColor: secondary,
          color: secondary,
          borderRadius: vs.radius,
          fontFamily: vs.fontFamily,
          boxShadow: `6px 6px 0 0 ${defaultBrandColors.ink}`,
        }}
      >
        {button}
      </KioskAction>
    </div>
  );

  const body =
    layout === "center" ? (
      <div
        className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-center justify-center gap-8 py-12 text-center md:gap-10 md:py-16"
        style={{ paddingLeft: padding, paddingRight: padding }}
      >
        {brandCol}
        {contentCol}
      </div>
    ) : (
      <div
        className="relative z-10 mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 content-center items-center gap-8 py-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-10 md:py-12 lg:gap-16"
        style={{ paddingLeft: padding, paddingRight: padding }}
      >
        <div
          className={`flex items-center justify-center ${
            layout === "split-right" ? "md:order-2" : ""
          }`}
        >
          {brandCol}
        </div>
        <div className={layout === "split-right" ? "md:order-1" : ""}>{contentCol}</div>
      </div>
    );

  return (
    <div
      className="relative flex min-h-0 flex-1 overflow-y-auto"
      style={{ ...kioskThemeVars(vs), backgroundColor: vs.bg, color: vs.text }}
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      {videoUrl ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ backgroundColor: hexToRgba(vs.bg, 0.62) }}
        />
      ) : null}
      {body}
    </div>
  );
}
