"use client";

type Props = {
  videoUrl?: string | null;
};

/**
 * Latar video kiosk (muted/autoplay/loop) — dipakai welcome, panduan, paket,
 * frame, pembayaran, dan result. Overlay transparan supaya teks tetap kontras;
 * fallback = warna background layar bila video tidak ada.
 */
export function KioskVideoBackground({ videoUrl }: Props) {
  if (!videoUrl) return null;
  return (
    <video
      key={videoUrl}
      src={videoUrl}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full object-cover opacity-50"
    />
  );
}
