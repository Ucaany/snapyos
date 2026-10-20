"use client";

import { kioskThemeVars, type KioskVisualStyle } from "@/lib/kiosk-types";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";

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
  const alignClass =
    align === "center"
      ? "items-center text-center"
      : align === "right"
        ? "items-end text-right"
        : "items-start text-left";
  const stepAlignClass =
    align === "center"
      ? "items-center text-center"
      : align === "right"
        ? "flex-row-reverse text-right"
        : "items-start text-left";
  return (
    <main
      className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-5 md:gap-8 md:p-6"
      style={{
        ...kioskThemeVars(kioskStyle),
        backgroundColor: kioskStyle.bg,
        color: kioskStyle.text,
        paddingLeft: kioskStyle.padding,
        paddingRight: kioskStyle.padding,
        fontFamily: kioskStyle.fontFamily,
      }}
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      <div className={`relative z-10 flex w-full max-w-2xl flex-col ${alignClass}`}>
        <p className="font-mono text-xs uppercase tracking-[0.25em] opacity-60">{"PETUNJUK"}</p>
        <h1
          className="mt-3 font-display uppercase leading-none tracking-tight"
          style={{ fontFamily: kioskStyle.fontFamily, fontSize: `${3 * kioskStyle.fontScale}rem` }}
        >
          {titleText || "Cara foto"}
        </h1>

        <ol className="mt-8 grid w-full gap-3">
          {steps.map((step, index) => (
            <li
              key={`${index}-${step}`}
              className={`flex gap-4 border-2 p-4 ${stepAlignClass}`}
              style={{ borderColor: kioskStyle.text, borderRadius: kioskStyle.radius }}
            >
              <span
                className="font-display text-lg font-bold leading-none"
                style={{ color: kioskStyle.text, opacity: 0.5 }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className="text-base leading-relaxed"
                style={{ fontSize: `${1 * kioskStyle.fontScale}rem` }}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>

        <div
          className={`mt-8 flex flex-wrap gap-3 ${align === "center" ? "justify-center" : align === "right" ? "justify-end" : ""}`}
        >
          <button
            type="button"
            onClick={onBack}
            className="min-h-14 border-2 px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.1em] transition-transform active:translate-y-[2px]"
            style={{
              borderColor: kioskStyle.text,
              color: kioskStyle.text,
              backgroundColor: "transparent",
              borderRadius: kioskStyle.radius,
            }}
          >
            Kembali
          </button>
          <button
            type="button"
            onClick={onStart}
            className="min-h-14 border-2 px-8 py-3 font-display text-lg font-bold uppercase tracking-tight shadow-[4px_4px_0_0_#111111] transition-transform active:translate-y-[2px] active:shadow-none"
            style={{
              borderColor: kioskStyle.text,
              color: kioskStyle.accentText,
              backgroundColor: kioskStyle.accent,
              borderRadius: kioskStyle.radius,
            }}
          >
            {buttonLabel || "Mulai"}
          </button>
        </div>
      </div>
    </main>
  );
}
