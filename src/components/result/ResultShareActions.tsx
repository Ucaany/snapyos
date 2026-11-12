"use client";

import { useState } from "react";
import { Check, Copy, Download, MessageCircle } from "lucide-react";

type Props = {
  /** Path halaman hasil (mis. /r/token) — null = belum tersedia. */
  sharePath: string | null;
  /** Path ZIP relatif terhadap origin, mis. /api/v1/public/results/<token>/zip. */
  zipHref: string | null;
};

/** Aksi berbagi halaman /r: salin link, WhatsApp, dan unduh ZIP. */
export function ResultShareActions({ sharePath, zipHref }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Origin dibaca SAAT interaksi (bukan saat render): SSR tidak punya window,
  // dan menghitungnya di render membuat markup server ≠ klien.
  function absoluteUrl(): string | null {
    if (!sharePath) return null;
    return `${window.location.origin}${sharePath}`;
  }

  async function copyLink() {
    const shareUrl = absoluteUrl();
    if (!shareUrl) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Browser menolak akses clipboard. Salin link secara manual.");
    }
  }

  function shareToWhatsApp() {
    const shareUrl = absoluteUrl();
    if (!shareUrl) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`Foto kamu siap: ${shareUrl}`)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  const buttonClass =
    "inline-flex min-h-11 items-center justify-center gap-2 border-2 border-ink bg-surface px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink shadow-hard outline-none transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyLink()}
          className={buttonClass}
          disabled={!sharePath}
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? "Link tersalin" : "Salin link"}
        </button>
        {sharePath && (
          <button type="button" onClick={shareToWhatsApp} className={buttonClass}>
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </button>
        )}
        {zipHref && (
          <a href={zipHref} className={buttonClass}>
            <Download className="size-4" aria-hidden /> Unduh semua (ZIP)
          </a>
        )}
      </div>
      {error && (
        <p role="alert" className="font-mono text-[11px] leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
