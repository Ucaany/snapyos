"use client";

import type { BrandingConfig, KioskBrandingConfig } from "@/lib/kiosk-types";
import { kioskThemeVars, kioskVisualStyle } from "@/lib/kiosk-types";
import { defaultBrandColors } from "@/lib/brand-defaults";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";

type Props = {
  business: { name: string; logo_url: string | null };
  branding: BrandingConfig;
  onStart: () => void;
};

/**
 * Welcome Screen — docs/05 §5.2. Layout 2 kolom (kiri brand, kanan judul+CTA),
 * touch-friendly, mengikuti kustomisasi branding.kiosk (warna, font scale,
 * radius, padding, visibilitas, video background looping ≤5s).
 */
export function WelcomeScreen({ business, branding, onStart }: Props) {
  const k: KioskBrandingConfig = branding.kiosk ?? {};
  const title = branding.welcome_title || business.name;
  const tagline = branding.welcome_tagline || "Capture your moment.";
  const button = branding.welcome_button || "Mulai";
  const showLogo = k.show_logo !== false;
  const showTagline = k.show_tagline !== false;
  // Gaya per layar: nilai global kiosk + override pages.welcome.
  const vs = kioskVisualStyle(k, "welcome");
  const fontScale = vs.fontScale;
  const radius = vs.radius;
  const padding = vs.padding;
  const secondary = branding.secondary_color || defaultBrandColors.ink;
  const primary = branding.primary_color || defaultBrandColors.accent;
  const bg = vs.bg;
  const text = vs.text;
  const layout = k.welcome_layout ?? "split-left";
  // Video: override per-layar (pages.welcome) menang atas video global.
  const videoUrl = k.pages?.welcome?.video_url ?? k.video_url ?? null;
  // Perataan konten (full element): default tengah; page override ?? global.
  const contentAlign = vs.align ?? "center";
  const alignClass =
    contentAlign === "left"
      ? "items-start text-left"
      : contentAlign === "right"
        ? "items-end text-right"
        : "items-center text-center";

  const brandCol = (
    <div className="flex flex-col items-center justify-center gap-5 text-center md:gap-6">
      {showLogo && business.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={business.logo_url}
          alt={`Logo ${business.name}`}
          className="max-h-24 w-auto object-contain md:max-h-32"
        />
      )}
      <p
        className="font-mono font-bold uppercase tracking-[0.3em] opacity-70"
        style={{ fontSize: `${0.75 * fontScale}rem` }}
      >
        {"" + business.name.toUpperCase()}
      </p>
    </div>
  );

  const contentCol = (
    <div className={`flex flex-col justify-center gap-6 md:gap-8 ${alignClass}`}>
      <h1
        className="max-w-[14ch] font-display font-bold uppercase leading-[0.95] tracking-tight"
        style={{ color: secondary, fontSize: `${3.5 * fontScale}rem`, fontFamily: vs.fontFamily }}
      >
        {title}
      </h1>
      {showTagline && (
        <p
          className="max-w-[36ch] leading-relaxed opacity-80"
          style={{ fontSize: `${1.125 * fontScale}rem` }}
        >
          {tagline}
        </p>
      )}
      <button
        type="button"
        onClick={onStart}
        className="min-h-16 border-2 px-12 py-4 font-display text-xl font-bold uppercase tracking-tight transition-transform active:translate-y-[2px] md:min-h-20 md:px-16 md:py-5 md:text-2xl"
        style={{
          backgroundColor: primary,
          borderColor: secondary,
          color: secondary,
          borderRadius: radius,
          fontFamily: vs.fontFamily,
          boxShadow: `6px 6px 0 0 ${defaultBrandColors.ink}`,
        }}
      >
        {button}
      </button>
    </div>
  );

  const padStyle = { paddingLeft: padding, paddingRight: padding };
  const body =
    layout === "center" ? (
      <div
        className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 flex-col items-center justify-center gap-8 py-16 text-center md:py-20"
        style={padStyle}
      >
        {brandCol}
        {contentCol}
      </div>
    ) : (
      <div
        className={`relative z-10 mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 items-center gap-8 py-10 md:grid-cols-2 md:gap-12 md:py-14 lg:gap-16 ${
          layout === "split-right" ? "md:[&>*:first-child]:order-2" : ""
        }`}
        style={padStyle}
      >
        {brandCol}
        {contentCol}
      </div>
    );

  return (
    <div
      className="relative flex min-h-0 flex-1 overflow-y-auto"
      style={{ ...kioskThemeVars(vs), backgroundColor: bg, color: text }}
    >
      {/* Video background attract loop: muted/autoplay/loop, overlay warna
          supaya teks tetap kontras; fallback = warna background. */}
      <KioskVideoBackground videoUrl={videoUrl} />
      {body}
    </div>
  );
}
