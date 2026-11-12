"use client";

import { Camera, Download, Printer } from "lucide-react";
import { kioskThemeVars, type KioskVisualStyle, type PublicPackage } from "@/lib/kiosk-types";
import type { KioskElementsConfig } from "@/lib/kiosk-elements";
import { kioskElementText } from "@/lib/kiosk-elements";
import { formatIDR } from "@/lib/dashboard-math";
import { defaultBrandColors } from "@/lib/brand-defaults";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import {
  KioskAction,
  KioskChip,
  KioskEyebrow,
  KioskHeader,
  KioskHeading,
  kioskFont,
  kioskGutter,
} from "@/components/kiosk/ui";
import { KioskElement } from "@/components/kiosk/KioskElement";

type Props = {
  packages: PublicPackage[];
  onSelect: (pkg: PublicPackage) => void;
  /** Kembali ke welcome — null = sembunyikan tombol Kembali (mis. kiosk tanpa guide). */
  onBack?: (() => void) | null;
  /** Matikan kartu selama resume-check / direct-session (tidak ada konteks loading lain). */
  busy?: boolean;
  /** Gaya visual kustom (Branding & Kiosk) — warna/font/radius mengikuti. */
  kioskStyle?: KioskVisualStyle;
  titleText?: string;
  /** Warna aksen kartu paket — mengikuti primary branding (bukan token accent tetap). */
  primaryColor?: string;
  secondaryColor?: string;
  videoUrl?: string | null;
  /** Kustomisasi elemen layar (Branding & Kiosk). */
  elements?: KioskElementsConfig;
};

/** Choose Package — docs/05 §5.3 (package menentukan harga & jumlah foto). */
export function PackagePicker({
  packages,
  onSelect,
  onBack = null,
  busy = false,
  kioskStyle,
  titleText,
  primaryColor,
  secondaryColor,
  videoUrl = null,
  elements,
}: Props) {
  const ks = kioskStyle;
  const eyebrowText = kioskElementText(elements, "eyebrow", "LANGKAH 01 · PILIH PAKET");
  const titleLabel = kioskElementText(elements, "title", titleText || "Pilih paket kamu");
  const hintText = kioskElementText(
    elements,
    "hint",
    "Harga sudah termasuk sesi foto, frame, dan hasil digital. Jumlah foto mengikuti slot frame yang dipilih; jumlah cetak mengikuti paket."
  );
  const backLabel = kioskElementText(elements, "back", "Kembali");
  const primary = primaryColor || defaultBrandColors.accent;
  const secondary = secondaryColor || defaultBrandColors.ink;
  const contentAlign = ks?.align ?? "center";
  const gutter = kioskGutter(ks?.padding);
  const radius = ks?.radius ?? 0;
  const scale = ks?.fontScale ?? 1;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={
        ks
          ? {
              ...kioskThemeVars(ks),
              backgroundColor: ks.bg,
              color: ks.text,
              fontFamily: ks.fontFamily,
            }
          : undefined
      }
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      <div
        className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 py-6 md:gap-7 md:py-8"
        style={{ paddingLeft: gutter, paddingRight: gutter }}
      >
        <KioskHeader
          eyebrow={eyebrowText}
          title={titleLabel}
          description={hintText}
          align={contentAlign}
          scale={scale}
          elements={elements}
          elementIds={{ eyebrow: "eyebrow", title: "title", description: "hint", actions: "back" }}
          actions={
            onBack ? (
              <KioskAction
                tone="secondary"
                size="md"
                onClick={onBack}
                kioskStyle={ks}
                className="font-mono tracking-[0.1em]"
              >
                {backLabel}
              </KioskAction>
            ) : null
          }
        />

        {packages.length === 0 ? (
          <KioskElement
            id="empty"
            defaultOrder={4}
            elements={elements}
            className="mx-auto flex w-full max-w-[720px] flex-1 flex-col"
          >
            <div
              className="flex w-full flex-1 flex-col items-start justify-center gap-4 border-2 border-dashed border-ink/40 bg-surface p-6 md:p-8"
              style={{ borderRadius: radius }}
            >
              <KioskEyebrow>{"BELUM ADA PAKET"}</KioskEyebrow>
              <p className="max-w-[50ch] text-sm leading-relaxed text-muted-foreground md:text-base">
                Owner belum mengaktifkan paket untuk booth ini. Hubungi petugas.
              </p>
              {onBack ? (
                <KioskAction tone="secondary" size="md" onClick={onBack} kioskStyle={ks}>
                  {backLabel}
                </KioskAction>
              ) : null}
            </div>
          </KioskElement>
        ) : (
          <KioskElement
            id="grid"
            defaultOrder={5}
            elements={elements}
            className="flex min-h-0 w-full flex-1 flex-col"
          >
            <div
              className="grid w-full flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:content-center"
              aria-busy={busy}
            >
              {packages.map((pkg, i) => {
                const featured = i === 0;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => onSelect(pkg)}
                    disabled={busy}
                    className="group flex h-full flex-col gap-3 border-2 border-ink bg-surface p-4 text-left shadow-hard transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-60 md:p-5"
                    style={{
                      borderRadius: radius,
                      // Kartu unggulan tetap menonjol lewat border tebal + hard
                      // shadow, bukan latar warna yang bisa menurunkan kontras teks.
                      borderColor: secondary,
                      borderWidth: featured ? 4 : 2,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <KioskEyebrow className="text-ink/60">
                        {`PAKET ${String(i + 1).padStart(2, "0")}`}
                      </KioskEyebrow>
                      <KioskChip
                        className="border-ink bg-bg text-ink"
                        style={{ borderRadius: radius }}
                      >
                        {`${pkg.print_count} CETAK`}
                      </KioskChip>
                    </div>

                    <KioskHeading as="h2" size="sm" scale={scale}>
                      {pkg.name}
                    </KioskHeading>

                    {pkg.description && (
                      <p className="text-xs leading-relaxed text-ink/70 md:text-sm">
                        {pkg.description}
                      </p>
                    )}

                    <p
                      className="font-mono font-bold leading-none tracking-[-0.02em] text-ink"
                      style={{ fontSize: kioskFont(1.5, 2, scale, 2.8) }}
                    >
                      {formatIDR(pkg.price)}
                    </p>

                    <ul className="flex flex-col gap-1.5 text-xs text-ink/80">
                      <li className="flex items-center gap-2">
                        <Camera className="size-4 shrink-0" aria-hidden /> foto mengikuti slot frame
                      </li>
                      <li className="flex items-center gap-2">
                        <Printer className="size-4 shrink-0" aria-hidden />{" "}
                        {pkg.print_count > 0 ? `${pkg.print_count} cetak` : "tanpa cetak"}
                      </li>
                      {pkg.digital_output && (
                        <li className="flex items-center gap-2">
                          <Download className="size-4 shrink-0" aria-hidden /> hasil digital
                        </li>
                      )}
                    </ul>

                    <span
                      aria-hidden
                      className="mt-auto inline-flex min-h-11 items-center justify-center border-2 border-ink px-3 py-2 font-display text-sm font-bold uppercase tracking-[-0.01em]"
                      style={{
                        borderRadius: radius,
                        // Pasangan aksen + accentText dijamin >=4.5:1 oleh palet kiosk.
                        backgroundColor: ks ? ks.accent : primary,
                        color: ks ? ks.accentText : undefined,
                      }}
                    >
                      {busy ? "Memuat..." : "Pilih paket"}
                    </span>
                  </button>
                );
              })}
            </div>
          </KioskElement>
        )}
      </div>
    </div>
  );
}
