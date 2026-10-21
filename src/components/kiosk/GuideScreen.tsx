"use client";

import { kioskThemeVars, type KioskVisualStyle } from "@/lib/kiosk-types";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import {
  KioskAction,
  KioskCard,
  KioskHeader,
  kioskFont,
  kioskGutter,
} from "@/components/kiosk/ui";

type Props = {
  steps: string[];
  kioskStyle: KioskVisualStyle;
  titleText?: string;
  buttonLabel?: string;
  videoUrl?: string | null;
  onStart: () => void;
  onBack: () => void;
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
}: Props) {
  const align = kioskStyle.align ?? "left";
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
          eyebrow="PETUNJUK"
          title={titleText || "Cara foto"}
          description="Ikuti urutan ini supaya hasil foto rapi dan tidak perlu diulang."
          align={align}
          scale={kioskStyle.fontScale}
          actions={
            <KioskAction
              tone="secondary"
              size="md"
              onClick={onBack}
              kioskStyle={kioskStyle}
              className="font-mono tracking-[0.1em]"
            >
              Kembali
            </KioskAction>
          }
        />

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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <KioskAction
            tone="primary"
            size="lg"
            onClick={onStart}
            kioskStyle={kioskStyle}
            className="sm:min-w-[220px]"
          >
            {buttonLabel || "Mulai"}
          </KioskAction>
          <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
            Kamera siap di langkah berikutnya
          </p>
        </div>
      </div>
    </main>
  );
}
