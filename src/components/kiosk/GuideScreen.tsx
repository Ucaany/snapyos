"use client";

import { kioskThemeVars, type KioskVisualStyle } from "@/lib/kiosk-types";
import type { KioskElementsConfig } from "@/lib/kiosk-elements";
import { kioskElementText } from "@/lib/kiosk-elements";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import { KioskAction, KioskCard, KioskHeader, kioskFont, kioskGutter } from "@/components/kiosk/ui";
import { KioskElement } from "@/components/kiosk/KioskElement";

type Props = {
  steps: string[];
  kioskStyle: KioskVisualStyle;
  titleText?: string;
  buttonLabel?: string;
  videoUrl?: string | null;
  onStart: () => void;
  onBack: () => void;
  /** Kustomisasi elemen layar (Branding & Kiosk). */
  elements?: KioskElementsConfig;
};

/** Guide Screen — docs/05 §5.1a (panduan cara foto, opsional per branding). */
export function GuideScreen({
  steps,
  kioskStyle,
  titleText,
  buttonLabel,
  videoUrl = null,
  onStart,
  onBack,
  elements,
}: Props) {
  const align = kioskStyle.align ?? "left";
  const eyebrowText = kioskElementText(elements, "eyebrow", "PETUNJUK");
  const titleLabel = kioskElementText(elements, "title", titleText || "Cara foto");
  const hintText = kioskElementText(
    elements,
    "hint",
    "Ikuti urutan ini supaya hasil foto rapi dan tidak perlu diulang."
  );
  const backLabel = kioskElementText(elements, "back", "Kembali");
  const ctaLabel = kioskElementText(elements, "cta", buttonLabel || "Mulai");
  const gutter = kioskGutter(kioskStyle.padding);
  return (
    <main
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{
        ...kioskThemeVars(kioskStyle),
        backgroundColor: kioskStyle.bg,
        color: kioskStyle.text,
        fontFamily: kioskStyle.fontFamily,
      }}
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      <div
        className="relative z-10 mx-auto flex w-full max-w-[1040px] flex-1 flex-col justify-center gap-7 py-8 md:gap-9 md:py-10"
        style={{ paddingLeft: gutter, paddingRight: gutter }}
      >
        <KioskHeader
          eyebrow={eyebrowText}
          title={titleLabel}
          description={hintText}
          align={align}
          scale={kioskStyle.fontScale}
          elements={elements}
          elementIds={{ eyebrow: "eyebrow", title: "title", description: "hint", actions: "back" }}
          actions={
            <KioskAction
              tone="secondary"
              size="md"
              onClick={onBack}
              kioskStyle={kioskStyle}
              className="font-mono tracking-[0.1em]"
            >
              {backLabel}
            </KioskAction>
          }
        />

        <KioskElement id="steps" defaultOrder={4} elements={elements} className="w-full">
          <ol className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, index) => (
              <li key={`${index}-${step}`}>
                <KioskCard
                  className="flex h-full flex-col gap-3 p-4 md:p-5"
                  style={{ borderRadius: kioskStyle.radius }}
                >
                  <span
                    className="font-display leading-none tracking-[-0.03em]"
                    style={{
                      fontSize: kioskFont(1.4, 2.1, kioskStyle.fontScale, 2.2),
                      opacity: 0.35,
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="text-sm leading-relaxed md:text-base"
                    style={{ fontSize: `${1 * kioskStyle.fontScale}rem` }}
                  >
                    {step}
                  </span>
                </KioskCard>
              </li>
            ))}
          </ol>
        </KioskElement>

        <KioskElement
          id="cta"
          defaultOrder={5}
          elements={elements}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <KioskAction
            tone="primary"
            size="lg"
            onClick={onStart}
            kioskStyle={kioskStyle}
            className="sm:min-w-[220px]"
          >
            {ctaLabel}
          </KioskAction>
        </KioskElement>
      </div>
    </main>
  );
}
