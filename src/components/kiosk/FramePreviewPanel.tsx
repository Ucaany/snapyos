"use client";

import { useEffect, useRef, useState } from "react";
import { defaultBrandColors } from "@/lib/brand-defaults";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import { slotsByZ, type TemplateLayout } from "@/lib/template-layout";
import { composeFrame, type ComposeSource } from "@/lib/compose-frame";
import { useObjectUrls } from "@/components/kiosk/use-object-url";

type Props = {
  /** Layout slot template terpilih. Null = tanpa frame (panel ini disembunyikan). */
  layout: TemplateLayout | null;
  /** URL PNG frame transparan (slot sudah berlubang). */
  frameUrl: string | null;
  /** Foto yang sudah dikonfirmasi, urut slot (index = slot ke-i). */
  captured: Blob[];
  /** Slot yang sedang diambil — diisi view kamera hidup. */
  activeSlot: number;
  /** Elemen <video> kamera yang sedang hidup (null saat review/unmount). */
  videoEl: HTMLVideoElement | null;
  /** Hasil baru yang belum dikonfirmasi (tampil saat stage review). */
  activeOverride: Blob | null;
  /** Preview kiosk di-mirror; hasil capture juga di-mirror di piksel. */
  mirror: boolean;
  /** Gaya visual kustom per layar (Branding & Kiosk). */
  kioskStyle?: KioskVisualStyle;
};

/**
 * Preview frame langsung saat sesi foto (docs/15 §15.4 — satu engine render).
 * Slot terisi menampilkan hasil foto; slot aktif menampilkan view kamera hidup,
 * sehingga customer melihat hasil akhir sambil berpose.
 */
export function FramePreviewPanel({
  layout,
  frameUrl,
  captured,
  activeSlot,
  videoEl,
  activeOverride,
  mirror,
  kioskStyle,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLImageElement | null>(null);
  const photoRef = useRef<(HTMLImageElement | null)[]>([]);
  const overrideRef = useRef<HTMLImageElement | null>(null);
  const mirrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Konteks offscreen dipakai ulang; getContext("2d") tiap frame = lookup baru
  // 60x/detik hanya untuk menggambar ulang canvas yang sama.
  const mirrorCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [frameError, setFrameError] = useState(false);
  const [assetVersion, setAssetVersion] = useState(0);
  // Object URL ref-counted (StrictMode-safe) untuk foto terkonfirmasi + override.
  const capturedUrls = useObjectUrls(captured);
  const overrideUrl = useObjectUrls(activeOverride ? [activeOverride] : [])[0] ?? null;

  // Muat frame PNG. Tanpa crossOrigin: preview tidak pernah dibaca-piksel,
  // jadi taint canvas tidak relevan (berbeda dari Editor yang men-toBlob).
  useEffect(() => {
    if (!frameUrl) {
      frameRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setFrameError(false);
      frameRef.current = img;
      setAssetVersion((v) => v + 1);
    };
    img.onerror = () => {
      if (!cancelled) setFrameError(true);
    };
    img.src = frameUrl;
    return () => {
      cancelled = true;
    };
  }, [frameUrl]);

  // Muat foto yang sudah dikonfirmasi (blob urut slot).
  useEffect(() => {
    if (capturedUrls.length !== captured.length || capturedUrls.some((u) => !u)) return;
    let cancelled = false;
    photoRef.current = captured.map(() => null);
    void Promise.all(
      capturedUrls.map(
        (url, i) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              if (!cancelled) photoRef.current[i] = img;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = url!;
          })
      )
    ).then(() => {
      if (!cancelled) setAssetVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [captured, capturedUrls]);

  // Muat hasil yang belum dikonfirmasi (stage review).
  useEffect(() => {
    if (!activeOverride || !overrideUrl) {
      overrideRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      overrideRef.current = img;
      setAssetVersion((v) => v + 1);
    };
    img.onerror = () => undefined;
    img.src = overrideUrl;
    return () => {
      cancelled = true;
    };
  }, [activeOverride, overrideUrl]);

  useEffect(() => {
    if (!layout) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxW = 420;
    const live = Boolean(videoEl && videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);

    /** Sumber untuk satu slot, urut z (mapping photos[i] → slot ke-i). */
    const sourceAt = (i: number): ComposeSource | null => {
      if (i === activeSlot) {
        if (overrideRef.current) return overrideRef.current;
        if (!live || !videoEl) return null;
        if (!mirror) return videoEl;
        // CSS scaleX(-1) tidak memengaruhi drawImage — mirror di piksel agar
        // preview identik dengan hasil capture (captureFrame juga mirror).
        const vw = videoEl.videoWidth || 1;
        const vh = videoEl.videoHeight || 1;
        let off = mirrorCanvasRef.current;
        if (!off) {
          off = document.createElement("canvas");
          mirrorCanvasRef.current = off;
        }
        if (off.width !== vw || off.height !== vh) {
          off.width = vw;
          off.height = vh;
        }
        const octx = mirrorCtxRef.current ?? (mirrorCtxRef.current = off.getContext("2d"));
        if (octx) {
          octx.save();
          octx.translate(vw, 0);
          octx.scale(-1, 1);
          octx.drawImage(videoEl, 0, 0, vw, vh);
          octx.restore();
        }
        return off;
      }
      return photoRef.current[i] ?? null;
    };

    const paint = () => {
      const ordered = slotsByZ(layout);
      const sources = ordered.map((_, i) => sourceAt(i));
      composeFrame(canvas, layout, frameRef.current, sources, [], maxW, "blank");
    };

    paint();
    // Slot aktif berisi view kamera hidup → repaint tiap frame.
    if (!live || overrideRef.current) return;
    let raf = 0;
    const loop = () => {
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [layout, activeSlot, videoEl, mirror, assetVersion]);

  if (!layout) return null;

  const slotTotal = layout.slots.length;

  return (
    <div className="flex w-full flex-col gap-2">
      <p
        className="font-mono text-[10px] uppercase tracking-[0.2em]"
        style={{ opacity: 0.6, color: kioskStyle ? kioskStyle.text : undefined }}
      >
        {"/// PREVIEW FRAME"}
      </p>
      <div className="relative mx-auto w-fit max-w-full border-2 border-ink bg-ink shadow-[4px_4px_0_0_#111111]">
        <canvas
          ref={canvasRef}
          className="block h-auto max-h-[38vh] w-auto max-w-full object-contain lg:max-h-[44vh]"
          aria-label={`Preview frame, slot ${activeSlot + 1} dari ${slotTotal}`}
        />
        {frameError && (
          <p
            className="absolute inset-x-0 bottom-0 border-t-2 border-ink px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{ background: defaultBrandColors.destructive, color: "#ffffff" }}
          >
            Frame gagal dimuat
          </p>
        )}
      </div>
      <p
        className="font-mono text-[10px] uppercase tracking-[0.12em]"
        style={{ opacity: 0.55, color: kioskStyle ? kioskStyle.text : undefined }}
      >
        {`Slot ${activeSlot + 1} / ${slotTotal} · ${captured.length} terisi`}
      </p>
    </div>
  );
}
