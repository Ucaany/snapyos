"use client";

import { Camera, Download, Printer } from "lucide-react";
import type { KioskVisualStyle, PublicPackage } from "@/lib/kiosk-types";
import { formatIDR } from "@/lib/dashboard-math";
import { defaultBrandColors } from "@/lib/brand-defaults";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";

type Props = {
  packages: PublicPackage[];
  onSelect: (pkg: PublicPackage) => void;
  /** Gaya visual kustom (Branding & Kiosk) — warna/font/radius mengikuti. */
  kioskStyle?: KioskVisualStyle;
  titleText?: string;
  /** Warna aksen kartu paket — mengikuti primary branding (bukan token accent tetap). */
  primaryColor?: string;
  secondaryColor?: string;
  videoUrl?: string | null;
};

/** Choose Package — docs/05 §5.3 (package menentukan harga & jumlah foto).
 *  Flow natural: proporsional di semua layar, scroll hanya bila konten lebih tinggi. */
export function PackagePicker({ packages, onSelect, kioskStyle, titleText, primaryColor, secondaryColor, videoUrl = null }: Props) {
  const ks = kioskStyle;
  const primary = primaryColor || defaultBrandColors.accent;
  const secondary = secondaryColor || defaultBrandColors.ink;
  const alignClass =
    ks?.align === "left" ? "text-left" : ks?.align === "right" ? "text-right" : "text-center";
  return (
    <div
      className="relative flex min-h-[100dvh] flex-1 flex-col gap-3 overflow-hidden bg-bg px-4 py-4 md:gap-4 md:px-6 md:py-5"
      style={ks ? { backgroundColor: ks.bg, color: ks.text, paddingLeft: ks.padding, paddingRight: ks.padding } : undefined}
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      <header className={`relative z-10 mx-auto w-full max-w-[1000px] shrink-0 ${alignClass}`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {"/// STEP 01 · PILIH PAKET"}
        </p>
        <h1
          className="mt-1 font-display text-2xl uppercase leading-[0.95] tracking-tight md:text-4xl"
          style={ks ? { fontFamily: ks.fontFamily, fontSize: `${1.5 * ks.fontScale}rem` } : undefined}
        >
          {titleText || "Pilih paket kamu"}
        </h1>
      </header>

      {packages.length === 0 ? (
        <div className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col items-start justify-center gap-3 border-2 border-dashed border-ink/40 bg-surface p-6">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
            {"/// BELUM ADA PAKET"}
          </p>
          <p className="max-w-[50ch] text-sm text-muted-foreground">
            Owner belum mengaktifkan paket untuk booth ini. Hubungi petugas.
          </p>
        </div>
      ) : (
        <div
          className="mx-auto grid w-full max-w-[1000px] flex-1 grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 md:content-center md:gap-6"
          role="list"
        >
          {packages.map((pkg, i) => (
            <button
              key={pkg.id}
              type="button"
              role="listitem"
              onClick={() => onSelect(pkg)}
              className="group flex flex-col gap-3 border-2 p-4 text-left shadow-[4px_4px_0_0_#111111] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[2px]"
              style={{
                ...(ks ? { borderRadius: ks.radius } : {}),
                backgroundColor: i === 0 ? primary : undefined,
                borderColor: secondary,
              }}
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/70">
                {`PKG-${String(i + 1).padStart(2, "0")}`}
              </p>
              <h2 className="font-display text-xl uppercase leading-none tracking-tight md:text-2xl">
                {pkg.name}
              </h2>
              <p className="font-mono text-2xl font-bold md:text-3xl">{formatIDR(pkg.price)}</p>
              <ul className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.05em]">
                <li className="flex items-center gap-2">
                  <Camera className="size-4" aria-hidden /> {pkg.photo_count} foto
                </li>
                <li className="flex items-center gap-2">
                  <Printer className="size-4" aria-hidden />{" "}
                  {pkg.print_count > 0 ? `${pkg.print_count} cetak` : "tanpa cetak"}
                </li>
                {pkg.digital_output && (
                  <li className="flex items-center gap-2">
                    <Download className="size-4" aria-hidden /> digital
                  </li>
                )}
              </ul>
              <span
                aria-hidden
                className="mt-auto inline-flex items-center justify-center border-2 bg-bg px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em]"
                style={{
                  backgroundColor: i === 0 ? undefined : primary,
                  borderColor: secondary,
                }}
              >
                Pilih
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
