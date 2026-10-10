"use client";

import type { KioskVisualStyle } from "@/lib/kiosk-types";

type Props = {
  steps: string[];
  kioskStyle: KioskVisualStyle;
  titleText?: string;
  buttonLabel?: string;
  onStart: () => void;
  onBack: () => void;
};

/** Guide Screen — docs/05 §5.1a (panduan cara foto, opsional per branding). */
export function GuideScreen({ steps, kioskStyle, titleText, buttonLabel, onStart, onBack }: Props) {
  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 p-6"
      style={{ backgroundColor: kioskStyle.bg, color: kioskStyle.text }}
    >
      <div className="w-full max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.25em] opacity-60">
          {"/// PETUNJUK"}
        </p>
        <h1
          className="mt-3 font-display text-5xl uppercase leading-none tracking-tight"
          style={{ fontFamily: kioskStyle.fontFamily }}
        >
          {titleText || "Cara foto"}
        </h1>

        <ol className="mt-8 grid gap-3">
          {steps.map((step, index) => (
            <li
              key={`${index}-${step}`}
              className="flex items-start gap-4 border-2 p-4"
              style={{ borderColor: kioskStyle.text, borderRadius: kioskStyle.radius }}
            >
              <span
                className="font-display text-lg font-bold leading-none"
                style={{ color: kioskStyle.text, opacity: 0.5 }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-base leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap gap-3">
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
              color: "#111111",
              backgroundColor: "#ffd400",
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
