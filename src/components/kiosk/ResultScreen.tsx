"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Check,
  Copy,
  Download,
  MessageCircle,
  Printer,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { defaultBrandColors } from "@/lib/brand-defaults";
import { kioskThemeVars, type KioskVisualStyle } from "@/lib/kiosk-types";
import { useObjectUrls } from "@/components/kiosk/use-object-url";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import { KioskAction, KioskEyebrow, KioskHeading, kioskGutter } from "@/components/kiosk/ui";

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
  /** Tanggal link hasil kedaluwarsa (finalized_at + retention). */
  expiresAt?: string | null;
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

/** Kiosk Result — docs/05 §5.13 (QR ke halaman result online). */
export function ResultScreen({
  resultToken,
  gifUrl,
  finalPhotos,
  businessName,
  printed,
  canPrint,
  pendingSync = false,
  syncFailed = false,
  expiresAt = null,
  resultTitle,
  resultHint,
  resultLayout = "qr-right",
  kioskStyle,
  videoUrl = null,
  onPrint,
  onReset,
}: Props) {
  // QR disimpan bersama token yang menghasilkannya. Tanpa pasangan itu, QR milik
  // sesi sebelumnya sempat tampil di layar sesi baru; dan menandai "sedang dimuat"
  // lewat state terpisah memaksa setState di badan efek (render berantai).
  const [qr, setQr] = useState<{ token: string; url?: string } | null>(null);
  const [gifError, setGifError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // iOS/Safari menyimpan hanya file pertama dari beberapa unduhan sekaligus.
  // Dibaca saat interaksi unduh (bukan saat render/effect) — userAgent tidak
  // tersedia saat SSR dan tidak perlu memicu render tambahan.
  const [iosDevice, setIosDevice] = useState(false);
  const [copied, setCopied] = useState(false);

  const downloadTimer = useRef<number | null>(null);
  const qrDark = kioskStyle?.text ?? defaultBrandColors.ink;
  const qrLight = kioskStyle?.bg ?? defaultBrandColors.bg;
  // QR hanya bermakna bila sesi sudah tersinkron: halaman /r/[token] hanya
  // merender sesi berstatus completed. Menampilkan QR saat pendingSync/syncFailed
  // mengirim customer ke link yang masih 404.
  const qrUsable = Boolean(resultToken) && !pendingSync && !syncFailed;

  useEffect(() => {
    if (!qrUsable || !resultToken) return;
    let cancelled = false;
    const target = `${window.location.origin}/r/${resultToken}`;
    QRCode.toDataURL(target, { width: 280, margin: 2, color: { dark: qrDark, light: qrLight } })
      .then((url) => {
        if (!cancelled) setQr({ token: resultToken, url });
      })
      .catch(() => {
        // Gagal render QR = ikon peringatan (cabang terakhir render), bukan
        // spinner abadi. Simpan token tanpa url supaya state ikut token ini.
        if (!cancelled) setQr({ token: resultToken });
      });
    return () => {
      cancelled = true;
    };
  }, [qrUsable, resultToken, qrDark, qrLight]);

  // Turunan, bukan state: belum ada entri untuk token ini = masih dimuat.
  const qrForToken = qr?.token === resultToken ? qr.url : undefined;
  const qrLoading = qrUsable && qr?.token !== resultToken;

  // Satu daftar object URL untuk preview DAN unduhan — dulu preview membuat
  // URL kedua untuk blob yang sama (dua URL hidup per foto).
  const photoUrls = useObjectUrls(finalPhotos.map((p) => p.blob));
  const previewPhoto = photoUrls[0] ?? null;
  const hasGif = Boolean(gifUrl) && !gifError;
  const canShare = qrUsable && Boolean(resultToken);
  const zipHref =
    qrUsable && resultToken
      ? `/api/v1/public/results/${encodeURIComponent(resultToken)}/zip`
      : null;
  const expiryLabel = (() => {
    if (!expiresAt) return null;
    const date = new Date(expiresAt);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  })();

  /** URL absolut dibaca saat interaksi — bukan saat render (SSR/hydration). */
  function resultShareUrl(): string | null {
    if (!canShare || !resultToken) return null;
    return `${window.location.origin}/r/${resultToken}`;
  }

  async function copyLink() {
    const shareUrl = resultShareUrl();
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function shareToWhatsApp() {
    const shareUrl = resultShareUrl();
    if (!shareUrl) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`Foto kamu siap: ${shareUrl}`)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  useEffect(() => {
    return () => {
      if (downloadTimer.current !== null) window.clearTimeout(downloadTimer.current);
    };
  }, []);

  /** Unduh SEMUA foto final (bukan hanya yang pertama) — grid hasil berisi N
   *  foto, jadi tombol unduh tidak boleh diam-diam menyimpan satu saja. */
  function downloadAll() {
    const urls = photoUrls.filter((u): u is string => Boolean(u));
    if (urls.length === 0) return;
    // Catat platform di sini: Safari iOS hanya menyimpan file pertama, dan
    // customer perlu tahu sebelum menekan tombol berulang kali.
    const ua = navigator.userAgent;
    const isIos =
      /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setIosDevice(isIos);
    setDownloading(true);
    urls.forEach((url, i) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `snapyos-${Date.now()}-${i + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    // Kembalikan label tombol setelah unduhan terakhir dimulai. Timer disimpan
    // agar dibatalkan saat unmount — setState pada komponen yang sudah lepas
    // memicu warning dan membocorkan timer di kiosk yang berjalan lama.
    if (downloadTimer.current !== null) window.clearTimeout(downloadTimer.current);
    downloadTimer.current = window.setTimeout(() => {
      downloadTimer.current = null;
      setDownloading(false);
    }, 600);
  }

  const isBelow = resultLayout === "qr-below";
  const qrFirst = resultLayout === "qr-left";
  const ks = kioskStyle;
  const radius = ks?.radius ?? 0;
  const gutter = kioskGutter(ks?.padding);
  const alignClass =
    ks?.align === "left"
      ? "items-start text-left"
      : ks?.align === "right"
        ? "items-end text-right"
        : "items-center text-center";

  const actionButtons = (
    <div className="flex w-full max-w-[320px] flex-col gap-2.5">
      {canPrint && (
        // Setelah cetak pertama, tombol tetap ada sebagai cetak ulang
        // (docs/05 §5.15.5) — kertas macet / hasil pudar tidak boleh
        // memaksa customer mengulang seluruh sesi.
        <KioskAction
          tone={printed ? "secondary" : "primary"}
          size="lg"
          kioskStyle={ks}
          onClick={onPrint}
          full
        >
          <Printer className="size-5" aria-hidden /> {printed ? "Cetak ulang" : "Cetak"}
        </KioskAction>
      )}
      {photoUrls.length > 0 && (
        <div className="flex flex-col gap-2">
          <KioskAction
            tone="secondary"
            size="lg"
            kioskStyle={ks}
            onClick={downloadAll}
            disabled={downloading}
            full
          >
            <Download className="size-5" aria-hidden />
            {downloading
              ? "Mengunduh..."
              : photoUrls.length > 1
                ? `Unduh ${photoUrls.length} foto`
                : "Unduh foto"}
          </KioskAction>
          {photoUrls.length > 1 && iosDevice && (
            <p role="status" className="text-[11px] leading-relaxed text-muted-foreground">
              Safari hanya menyimpan file pertama. Untuk semua foto, pindai QR di ponsel.
            </p>
          )}
        </div>
      )}
      {expiryLabel && (
        <p className="text-[10px] uppercase leading-snug tracking-[0.1em] text-muted-foreground">
          {`Link berlaku sampai ${expiryLabel}`}
        </p>
      )}
      {(canShare || zipHref) && (
        <div className="flex flex-wrap gap-2">
          {canShare && (
            <KioskAction
              tone="secondary"
              size="sm"
              kioskStyle={ks}
              onClick={() => void copyLink()}
              className="flex-1"
            >
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied ? "Tersalin" : "Salin link"}
            </KioskAction>
          )}
          {canShare && (
            <KioskAction
              tone="secondary"
              size="sm"
              kioskStyle={ks}
              onClick={shareToWhatsApp}
              className="flex-1"
            >
              <MessageCircle className="size-4" aria-hidden /> WhatsApp
            </KioskAction>
          )}
          {zipHref && (
            <a
              href={zipHref}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 border-2 border-ink bg-surface px-3 py-2 font-display text-xs font-bold uppercase tracking-[-0.01em] text-ink shadow-hard-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              style={ks ? { borderRadius: radius } : undefined}
            >
              <Download className="size-4" aria-hidden /> ZIP
            </a>
          )}
        </div>
      )}
      <KioskAction tone="primary" size="lg" kioskStyle={ks} onClick={onReset} full>
        <Check className="size-5" aria-hidden /> Selesai
      </KioskAction>
    </div>
  );

  return (
    <div
      className={`relative flex min-h-0 flex-1 overflow-y-auto ${isBelow ? "flex-col" : "flex-col lg:flex-row lg:overflow-hidden"}`}
      style={
        ks
          ? {
              ...kioskThemeVars(ks),
              backgroundColor: ks.bg,
              color: ks.text,
            }
          : undefined
      }
    >
      <KioskVideoBackground videoUrl={videoUrl} />

      {/* Panel kiri: preview hasil. Latar permukaan membuat foto menonjol. */}
      <div
        className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-4 py-5 lg:min-h-0 lg:overflow-y-auto lg:py-6 ${
          videoUrl ? "bg-transparent" : "bg-surface"
        } ${
          isBelow
            ? "border-b-2 border-ink/15"
            : "border-b-2 border-ink/15 lg:border-b-0 lg:border-r-2"
        } ${qrFirst && !isBelow ? "lg:order-2 lg:border-r-0 lg:border-l-2" : ""}`}
        style={{ paddingLeft: gutter, paddingRight: gutter }}
      >
        <KioskEyebrow>{businessName}</KioskEyebrow>
        {previewPhoto ? (
          <div className="grid max-h-[46vh] w-full max-w-[560px] grid-cols-2 gap-2 lg:max-h-[62vh]">
            {photoUrls
              .filter((u): u is string => Boolean(u))
              .map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={`Hasil foto ${i + 1}`}
                  className="h-full w-full border-2 border-ink object-contain shadow-hard"
                />
              ))}
          </div>
        ) : (
          <div
            role="status"
            aria-label="Memuat foto"
            className="flex h-[38vh] w-[min(46vh,78vw)] items-center justify-center border-2 border-dashed border-ink/30 bg-muted p-6"
          >
            <span
              className="h-3/4 w-3/4 animate-pulse border-2 border-ink/15 bg-ink/10"
              aria-hidden
            />
          </div>
        )}

        {hasGif ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* GIF ditampilkan seukuran potret hasil capture: thumbnail 48px
                tidak membuktikan GIF-nya bergerak. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gifUrl ?? undefined}
              alt="Preview GIF"
              className="h-[clamp(120px,18vh,180px)] w-auto border-2 border-ink object-contain"
              style={ks ? { borderRadius: radius } : undefined}
              onError={() => setGifError(true)}
            />
            <div className="flex flex-col gap-1.5">
              <KioskEyebrow>GIF slideshow</KioskEyebrow>
              <a
                href={gifUrl ?? "#"}
                download="snapyos-slideshow.gif"
                className="inline-flex min-h-11 items-center gap-1.5 border-2 border-ink bg-bg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                style={ks ? { borderRadius: radius } : undefined}
              >
                <Download className="size-3.5" aria-hidden /> Unduh GIF
              </a>
            </div>
          </div>
        ) : (
          // GIF gagal dimuat / dimatikan owner: hasil foto tetap lengkap di
          // atas. Panel ini menjelaskan kenapa tidak ada GIF, bukan spinner
          // abadi atau ruang kosong yang terlihat seperti error kiosk.
          <div
            role="status"
            className="flex max-w-[320px] flex-col items-center gap-1 border-2 border-dashed border-ink/30 bg-muted px-4 py-3 text-center"
            style={ks ? { borderRadius: radius } : undefined}
          >
            <KioskEyebrow>GIF slideshow</KioskEyebrow>
            <p className="text-[10px] font-bold uppercase leading-snug tracking-[0.08em] text-muted-foreground">
              {gifError
                ? "GIF tidak bisa dimuat. Foto berframe tetap bisa diunduh di atas."
                : "GIF belum tersedia. Foto hasil sesi ini tetap bisa diunduh di atas."}
            </p>
          </div>
        )}
      </div>

      {/* Panel QR: status + CTA (posisi via result_layout, perataan via align) */}
      <div
        className={`flex shrink-0 flex-col justify-center gap-4 overflow-y-auto py-5 lg:max-h-[100dvh] lg:py-6 ${
          isBelow ? "w-full" : "lg:w-[40%]"
        } ${qrFirst && !isBelow ? "lg:order-1" : ""} ${alignClass}`}
        style={{ paddingLeft: gutter, paddingRight: gutter }}
      >
        <div className="flex flex-col gap-2">
          <KioskHeading size="md" scale={ks?.fontScale ?? 1} style={{ fontFamily: ks?.fontFamily }}>
            {resultTitle || "Foto kamu jadi!"}
          </KioskHeading>
          <p className="max-w-[38ch] text-sm leading-relaxed text-muted-foreground md:text-base">
            {resultHint ||
              "Pindai QR untuk mengunduh GIF animasi dan foto berframe di ponsel Anda."}
          </p>
        </div>

        <div
          className="flex flex-col items-center gap-3 border-2 border-ink bg-surface p-4 shadow-hard md:p-5"
          style={ks ? { borderRadius: radius } : undefined}
        >
          <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase leading-none tracking-[0.1em]">
            <Check className="size-4 text-accent-3" aria-hidden />
            {printed ? "Permintaan print dikirim" : "Hasil digital siap"}
          </p>
          {pendingSync && (
            <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase leading-snug tracking-[0.08em] text-muted-foreground">
              <RefreshCcw className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden />
              Menunggu sinkronisasi. Hasil online aktif setelah koneksi kembali
            </p>
          )}
          {syncFailed && (
            <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase leading-snug tracking-[0.08em]">
              <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
              Sesi berakhir sebelum sinkron. Hubungi petugas untuk hasil foto
            </p>
          )}

          {!qrUsable ? (
            <div className="max-w-[30ch] border-2 border-ink bg-accent-2 p-4 text-center text-xs font-bold uppercase leading-relaxed tracking-[0.04em]">
              {syncFailed
                ? "Hasil online tidak tersedia. Hubungi petugas untuk salinan foto."
                : "Hasil tersimpan di perangkat. QR aktif setelah sinkronisasi selesai."}
            </div>
          ) : qrLoading ? (
            <div
              role="status"
              aria-label="Memuat QR"
              className="flex h-[clamp(140px,22vh,220px)] w-[clamp(140px,22vh,220px)] items-center justify-center border-2 border-ink bg-muted p-4"
            >
              <span
                className="size-3/4 animate-pulse border-2 border-ink/15 bg-ink/10"
                aria-hidden
              />
            </div>
          ) : qrForToken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrForToken}
              alt="QR code menuju hasil foto"
              className="h-[clamp(140px,22vh,220px)] w-[clamp(140px,22vh,220px)] border-2 border-ink"
            />
          ) : (
            <div className="flex h-[clamp(140px,22vh,220px)] w-[clamp(140px,22vh,220px)] items-center justify-center border-2 border-dashed border-destructive bg-muted">
              <TriangleAlert className="size-8 text-destructive" aria-hidden />
            </div>
          )}
        </div>

        {actionButtons}
      </div>
    </div>
  );
}
