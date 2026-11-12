"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { KioskScreenRenderer } from "@/components/kiosk/KioskScreenRenderer";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import {
  KioskAction,
  KioskCard,
  KioskEyebrow,
  KioskHeading,
  kioskGutter,
} from "@/components/kiosk/ui";
import { WelcomeScreen } from "@/components/kiosk/WelcomeScreen";
import { kioskVisualStyle, type BrandingConfig, type KioskPageId } from "@/lib/kiosk-types";
import { KIOSK_PAGE_OPTIONS } from "@/lib/kiosk-pages";
import { kioskElementDefs, kioskElementText, resolveKioskElement } from "@/lib/kiosk-elements";
import type { KioskOrientation } from "@/lib/kiosk-screen-registry";

const FALLBACK_COPY: Record<KioskPageId, { title: string; body: string }> = {
  welcome: { title: "Sambutan", body: "Tekan mulai untuk memilih paket foto." },
  guide: { title: "Petunjuk", body: "Ikuti langkah yang tampil di layar." },
  package: { title: "Pilih paket", body: "Pilih paket foto yang tersedia." },
  payment: { title: "Pembayaran", body: "Ikuti instruksi pembayaran di layar." },
  template: { title: "Pilih template", body: "Pilih template yang ingin dipakai." },
  capture: { title: "Ambil foto", body: "Ikuti hitungan mundur di layar." },
  edit: { title: "Sunting foto", body: "Atur foto sebelum dicetak." },
  result: { title: "Hasil", body: "Ikuti petunjuk untuk mengambil hasil." },
};

function pageCopy(branding: BrandingConfig, page: KioskPageId) {
  const k = branding.kiosk ?? {};
  const fallback = FALLBACK_COPY[page];
  switch (page) {
    case "guide":
      return { title: k.guide_title || fallback.title, body: fallback.body };
    case "package":
      return { title: k.package_title || fallback.title, body: fallback.body };
    case "payment":
      return { title: k.payment_title || fallback.title, body: k.payment_hint || fallback.body };
    case "template":
      return { title: k.template_title || fallback.title, body: fallback.body };
    case "capture":
      return { title: k.capture_title || fallback.title, body: k.capture_hint || fallback.body };
    case "edit":
      return { title: k.editor_title || fallback.title, body: k.editor_hint || fallback.body };
    case "result":
      return { title: k.result_title || fallback.title, body: k.result_hint || fallback.body };
    default:
      return fallback;
  }
}

function NeutralScreen({ page, branding }: { page: KioskPageId; branding: BrandingConfig }) {
  const entry = KIOSK_PAGE_OPTIONS.find((item) => item.id === page) ?? KIOSK_PAGE_OPTIONS[0]!;
  const copy = pageCopy(branding, page);
  const vs = kioskVisualStyle(branding.kiosk, page, {
    primary: branding.primary_color,
    secondary: branding.secondary_color,
  });
  const align = vs.align ?? "center";
  const textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";
  const alignItems =
    align === "left" ? "items-start" : align === "right" ? "items-end" : "items-center";
  const gutter = kioskGutter(vs.padding);
  const elements = branding.kiosk?.pages?.[page]?.elements;

  const ordered = kioskElementDefs(page)
    .map((def, index) => ({
      def,
      index,
      resolved: resolveKioskElement(elements, def.id, index),
    }))
    .filter((item) => !item.resolved.hidden)
    .sort((a, b) => a.resolved.order - b.resolved.order || a.index - b.index);

  return (
    <div
      className={`mx-auto flex w-full max-w-[900px] flex-1 flex-col justify-center gap-5 ${alignItems}`}
      style={{ padding: gutter, textAlign }}
    >
      {ordered.map(({ def, resolved }) => {
        const style = resolved.style;
        switch (def.id) {
          case "eyebrow":
            return (
              <div key={def.id} style={style}>
                <KioskEyebrow>
                  {kioskElementText(elements, "eyebrow", entry.label.toUpperCase())}
                </KioskEyebrow>
              </div>
            );
          case "title":
            return (
              <div key={def.id} style={style}>
                <KioskHeading
                  as="h2"
                  size="md"
                  scale={vs.fontScale}
                  style={{ fontFamily: vs.fontFamily, color: vs.primary }}
                >
                  {kioskElementText(elements, "title", copy.title)}
                </KioskHeading>
              </div>
            );
          case "hint":
            return (
              <div key={def.id} style={style}>
                <p className="max-w-[52ch] text-base leading-relaxed opacity-80 md:text-lg">
                  {kioskElementText(elements, "hint", copy.body)}
                </p>
              </div>
            );
          case "cta":
            return (
              <div key={def.id} style={style}>
                <KioskAction
                  tone="primary"
                  size="lg"
                  kioskStyle={vs}
                  className="w-full max-w-[280px]"
                >
                  {kioskElementText(elements, "cta", "Lanjut")}
                </KioskAction>
              </div>
            );
          default:
            return (
              <div key={def.id} style={style}>
                <KioskCard className="w-full max-w-[560px] p-3" style={{ borderRadius: vs.radius }}>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">
                    {def.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed opacity-70">
                    Konten {def.label.toLowerCase()} terisi otomatis saat kiosk berjalan.
                  </p>
                </KioskCard>
              </div>
            );
        }
      })}
    </div>
  );
}

function CanvasFrame({
  orientation,
  children,
}: {
  orientation: KioskOrientation;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const width = orientation === "portrait" ? 1080 : 1920;
  const height = orientation === "portrait" ? 1920 : 1080;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? element.clientWidth;
      setScale(measured > 0 ? measured / width : 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden border-2 border-ink bg-bg"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div
        inert
        className="pointer-events-none absolute left-0 top-0 flex select-none flex-col"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

type Props = {
  businessName: string;
  branding: BrandingConfig;
  page: KioskPageId;
  initialOrientation: KioskOrientation;
};

/** Pratinjau in-page memakai komponen kiosk asli (bukan iframe). */
export function DesignBuilderPreview({ businessName, branding, page, initialOrientation }: Props) {
  const [orientation, setOrientation] = useState<KioskOrientation>(initialOrientation);
  const [mobileOpen, setMobileOpen] = useState(false);

  const entry = KIOSK_PAGE_OPTIONS.find((item) => item.id === page) ?? KIOSK_PAGE_OPTIONS[0]!;
  const business = { name: businessName, logo_url: branding.logo_url ?? null };
  const videoUrl = branding.kiosk?.pages?.[page]?.video_url ?? null;
  const hasData = businessName.trim().length > 0;

  return (
    <section
      aria-labelledby="design-preview-heading"
      className="flex min-w-0 flex-col gap-3 border-2 border-ink bg-surface p-3 shadow-hard lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            PRATINJAU LANGSUNG
          </p>
          <h2
            id="design-preview-heading"
            className="font-display text-base font-bold uppercase leading-none tracking-tight"
          >
            Kiosk · {entry.label}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          className="min-h-11 border-2 border-ink bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden"
        >
          {mobileOpen ? "Sembunyikan pratinjau" : "Lihat pratinjau"}
        </button>
      </div>

      <div className={mobileOpen ? "flex flex-col gap-3" : "hidden lg:flex lg:flex-col lg:gap-3"}>
        <div className="grid grid-cols-1 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Orientasi · pratinjau saja
            </span>
            <div role="group" aria-label="Orientasi pratinjau" className="flex gap-2">
              {(
                [
                  ["portrait", "Tegak"],
                  ["landscape", "Mendatar"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={orientation === value}
                  onClick={() => setOrientation(value)}
                  className={`min-h-11 flex-1 border-2 border-ink px-2 font-mono text-[10px] uppercase tracking-[0.08em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                    orientation === value ? "bg-accent text-ink" : "bg-surface hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {hasData ? (
          <CanvasFrame orientation={orientation}>
            {page === "welcome" ? (
              <WelcomeScreen
                business={business}
                branding={branding}
                onStart={() => undefined}
                headingAs="h2"
                elements={branding.kiosk?.pages?.[page]?.elements}
              />
            ) : (
              <KioskScreenRenderer
                screen={entry.screen}
                kiosk={branding.kiosk}
                brand={{
                  primary: branding.primary_color,
                  secondary: branding.secondary_color,
                }}
                orientation={orientation}
                safeArea={false}
                className="flex-1"
              >
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <KioskVideoBackground videoUrl={videoUrl} />
                  <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                    <NeutralScreen page={page} branding={branding} />
                  </div>
                </div>
              </KioskScreenRenderer>
            )}
          </CanvasFrame>
        ) : (
          <div className="border-2 border-ink bg-bg p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Pratinjau belum tersedia
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Nama bisnis belum terbaca. Pratinjau muncul setelah data bisnis tersedia.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
