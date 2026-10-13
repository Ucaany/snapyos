"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Download, Loader2, Printer, RefreshCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { defaultBrandColors } from "@/lib/brand-defaults";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import { useObjectUrl } from "@/components/kiosk/use-object-url";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";

type FinalPhoto = { blob: Blob };

type Props = {
  resultToken: string | null;
  gifUrl: string | null;
  finalPhotos: FinalPhoto[];
  businessName: string;
  printed: boolean;
  canPrint: boolean;
  /** True bila hasil difinalisasi offline & belum tersinkron ke server. */
  pendingSync?: boolean;
  /** Terminal: grace window server terlewat — hasil online tidak tersedia. */
  syncFailed?: boolean;
  /** Teks kustom owner (Branding & Kiosk) — kosong = default. */
  resultTitle?: string;
  resultHint?: string;
  /** Layout: QR kanan (default) / kiri / bawah. */
  resultLayout?: "qr-right" | "qr-left" | "qr-below";
  /** Gaya visual kustom (Branding & Kiosk). */
  kioskStyle?: KioskVisualStyle;
  /** Video promo latar layar result (opsional, pages.result.video_url). */
  videoUrl?: string | null;
  onPrint: () => void;
  onReset: () => void;
};

/** Kiosk Result — docs/05 §5.13 (QR ke halaman result online).
 *  2-part layout: left = photo/GIF preview, right = QR + CTA. */
export function ResultScreen({
  resultToken,
  gifUrl,
  finalPhotos,
  businessName,
  printed,
  canPrint,
  pendingSync = false,
  syncFailed = false,
  resultTitle,
  resultHint,
  resultLayout = "qr-right",
  kioskStyle,
  videoUrl = null,
  onPrint,
  onReset,
}: Props) {
  const [qr, setQr] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(true);
  const [gifError, setGifError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const qrDark = kioskStyle?.text ?? defaultBrandColors.ink;
  const qrLight = kioskStyle?.bg ?? defaultBrandColors.bg;

  useEffect(() => {
    let cancelled = false;
    if (!resultToken) {
      return;
    }
    const target = `${window.location.origin}/r/${resultToken}`;
    QRCode.toDataURL(target, { width: 280, margin: 2, color: { dark: qrDark, light: qrLight } })
      .then((url) => {
        if (!cancelled) {
          setQr(url);
          setQrLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setQrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resultToken, qrDark, qrLight]);

  const previewPhoto = useObjectUrl(finalPhotos[0]?.blob ?? null);
  const hasGif = Boolean(gifUrl) && !gifError;

  function downloadPhoto() {
    if (!previewPhoto) return;
    setDownloading(true);
    const a = document.createElement("a");
    a.href = previewPhoto;
    a.download = `snapyos-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(false), 500);
  }

  const isBelow = resultLayout === "qr-below";
  const qrFirst = resultLayout === "qr-left";
  const ks = kioskStyle;

  return (
    <div
      className={`relative flex min-h-[100dvh] overflow-y-auto bg-bg ${isBelow ? "flex-col" : "flex-col lg:flex-row lg:overflow-hidden"}`}
      style={ks ? { backgroundColor: ks.bg, color: ks.text, paddingLeft: ks.padding, paddingRight: ks.padding } : undefined}
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      {/* Left panel — photo/GIF preview */}
      <div
        className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-4 p-4 lg:p-8 ${
          videoUrl ? "bg-transparent" : "bg-surface"
        } ${
          isBelow
            ? "border-b-2 border-ink overflow-y-auto"
            : "border-b-2 border-ink lg:border-b-0 lg:border-r-2"
        } ${qrFirst && !isBelow ? "lg:order-2 lg:border-r-0 lg:border-l-2" : ""}`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {"/// " + businessName.toUpperCase()}
        </p>
        {previewPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewPhoto}
            alt="Hasil foto berframe"
            className="max-h-[55vh] max-w-full border-2 border-ink shadow-[4px_4px_0_0_#111111] lg:max-h-[68vh]"
          />
        ) : (
          <div className="flex h-[40vh] w-[min(50vh,80vw)] items-center justify-center border-2 border-dashed border-ink/30 bg-muted">
            <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}

        {hasGif ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gifUrl ?? undefined}
              alt="Preview GIF"
              className="h-12 w-12 border-2 border-ink object-cover"
              onError={() => setGifError(true)}
            />
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                GIF Slideshow
              </p>
              <a
                href={gifUrl ?? "#"}
                download="snapyos-slideshow.gif"
                className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent-2/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] hover:bg-accent-2/20"
              >
                <Download className="size-3" aria-hidden /> Unduh GIF
              </a>
            </div>
          </div>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            GIF belum tersedia
          </p>
        )}
      </div>

      {/* QR panel — status + CTA (posisi via result_layout, perataan via align) */}
      <div
        className={`flex shrink-0 flex-col justify-center gap-5 p-6 lg:p-8 ${
          isBelow ? "w-full" : "lg:w-[38%]"
        } ${qrFirst && !isBelow ? "lg:order-1" : ""} ${
          ks?.align === "left"
            ? "items-start text-left"
            : ks?.align === "right"
              ? "items-end text-right"
              : "items-center text-center"
        }`}
      >
        <div className="flex flex-col gap-2">
          <h1
            className="font-display text-3xl uppercase leading-[0.9] tracking-tight md:text-4xl lg:text-5xl"
            style={ks ? { fontSize: `${1.875 * ks.fontScale}rem`, fontFamily: ks.fontFamily } : undefined}
          >
            {resultTitle || "Foto kamu jadi!"}
          </h1>
          <p className="max-w-[36ch] text-xs leading-relaxed text-muted-foreground md:text-sm">
            {resultHint || "Pindai QR untuk mengunduh GIF animasi dan foto berframe di ponsel Anda."}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111] md:p-6">
          <p className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
            <Check className="size-4 text-accent-3" aria-hidden />
            {printed ? "Permintaan print dikirim" : "Hasil digital siap"}
          </p>
          {pendingSync && (
            <p className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <RefreshCcw className="size-4 animate-spin" aria-hidden />
              Menunggu sinkronisasi. Hasil online aktif setelah koneksi kembali
            </p>
          )}
          {syncFailed && (
            <p className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
              <TriangleAlert className="size-4 text-destructive" aria-hidden />
              Sesi berakhir sebelum sinkron. Hubungi petugas untuk hasil foto
            </p>
          )}

          {!resultToken ? (
            <div className="max-w-[28ch] border-2 border-ink bg-accent-2/10 p-4 text-center font-mono text-xs font-bold uppercase tracking-[0.08em]">
              Hasil tersimpan di perangkat. Hubungkan kiosk ke internet untuk sinkronisasi.
            </div>
          ) : qrLoading ? (
            <div className="flex h-[200px] w-[200px] items-center justify-center border-2 border-ink bg-muted">
              <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code menuju hasil foto" className="h-[200px] w-[200px] border-2 border-ink md:h-[240px] md:w-[240px]" />
          ) : (
            <div className="flex h-[200px] w-[200px] items-center justify-center border-2 border-dashed border-destructive bg-muted">
              <TriangleAlert className="size-8 text-destructive" aria-hidden />
            </div>
          )}
        </div>

        <div className="flex w-full max-w-[280px] flex-col gap-3">
          {canPrint && !printed && (
            <Button size="lg" onClick={onPrint} className="bg-accent" style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}>
              <Printer className="size-5" aria-hidden /> Print
            </Button>
          )}
          {previewPhoto && (
            <Button
              size="lg"
              variant="outline"
              onClick={downloadPhoto}
              disabled={downloading}
              style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}
            >
              <Download className="size-5" aria-hidden />
              {downloading ? "Mengunduh…" : "Download"}
            </Button>
          )}
          <Button size="lg" onClick={onReset} className="bg-accent-3" style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}>
            <Check className="size-5" aria-hidden /> Selesai
          </Button>
        </div>
      </div>
    </div>
  );
}
