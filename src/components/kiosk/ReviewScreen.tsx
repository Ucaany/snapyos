"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCcw } from "lucide-react";
import { captureFrame, normalizeRotation, normalizeZoom } from "@/lib/camera-capture";
import { captureFromBridge, checkCameraBridge, resolveCameraProvider } from "@/lib/camera-provider";
import {
  filterCss,
  kioskThemeVars,
  type CameraSettings,
  type CapturePhoto,
  type KioskVisualStyle,
} from "@/lib/kiosk-types";
import { useObjectUrls } from "@/components/kiosk/use-object-url";
import { KioskAction, kioskGutter } from "@/components/kiosk/ui";

type Props = {
  photos: CapturePhoto[];
  photoCount: number;
  maxRetakes: number | null;
  retakeCount: number;
  cameraSettings: CameraSettings;
  kioskStyle?: KioskVisualStyle;
  titleText?: string;
  filterId?: string;
  onContinue: (photos: CapturePhoto[], retakeCount: number) => void;
};

/**
 * Review grid setelah capture — customer bisa mengganti satu foto tanpa
 * mengulang seluruh sesi. Retake memakai kamera yang sama dengan `CameraCapture`
 * (browser getUserMedia atau bridge runtime).
 */
export function ReviewScreen({
  photos,
  photoCount,
  maxRetakes,
  retakeCount,
  cameraSettings,
  kioskStyle,
  titleText,
  filterId = "original",
  onContinue,
}: Props) {
  const [currentPhotos, setCurrentPhotos] = useState<CapturePhoto[]>(photos);
  const [retakes, setRetakes] = useState(retakeCount);
  const [retaking, setRetaking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const provider = resolveCameraProvider(cameraSettings);
  const urls = useObjectUrls(currentPhotos.map((p) => p.blob));

  // Retake berikutnya selalu menimpa foto pertama yang belum diganti? Tidak:
  // customer memilih slot spesifik lewat tombol "Ulang foto N".
  const canRetake = maxRetakes === null || retakes < maxRetakes;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    // Status kamera di-reset di handler (bukan di badan effect): setState
    // langsung di effect memicu render berantai.
    if (retaking === null) {
      stopStream();
      return;
    }
    let cancelled = false;
    const open = async () => {
      if (provider === "bridge") {
        try {
          const result = await checkCameraBridge(cameraSettings);
          if (cancelled) return;
          if (!result.ok || !result.camera)
            throw new Error(result.message || "Kamera bridge tidak siap.");
          setCameraReady(true);
        } catch (cause) {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : "Kamera bridge tidak siap.");
          }
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: cameraSettings.facingMode ?? undefined,
            width: { ideal: cameraSettings.capture_width || 1920 },
            height: { ideal: cameraSettings.capture_height || 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraReady(true);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Kamera tidak bisa dibuka.");
        }
      }
    };
    void open();
    return () => {
      cancelled = true;
      stopStream();
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [cameraSettings, provider, retaking, stopStream]);

  function startRetake(index: number) {
    setError(null);
    setCameraReady(false);
    setCountdown(null);
    setRetaking(index);
  }

  function cancelRetake() {
    setRetaking(null);
    setCameraReady(false);
    setCountdown(null);
    setError(null);
  }

  async function captureRetake() {
    if (retaking === null || !cameraReady) return;
    const seconds = Math.max(1, cameraSettings.countdown_seconds || 3);
    let remaining = seconds;
    setCountdown(remaining);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        void takePhoto();
      }
    }, 1000);
  }

  async function takePhoto() {
    if (retaking === null) return;
    try {
      const photo =
        provider === "bridge"
          ? { blob: await captureFromBridge(cameraSettings) }
          : await captureFrame(
              videoRef.current!,
              cameraSettings.jpeg_quality || 0.92,
              false,
              normalizeRotation(cameraSettings.rotation_degrees),
              normalizeZoom(cameraSettings.zoom)
            );
      setCurrentPhotos((prev) => prev.map((item, index) => (index === retaking ? photo : item)));
      setRetakes((value) => value + 1);
      setRetaking(null);
      setCountdown(null);
      setCameraReady(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengambil foto ulang.");
      setCountdown(null);
    }
  }

  const heading = titleText || "Cek foto";
  const gutter = kioskGutter(kioskStyle?.padding);
  const alignClass =
    kioskStyle?.align === "left"
      ? "items-start text-left"
      : kioskStyle?.align === "right"
        ? "items-end text-right"
        : "items-center text-center";

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg"
      style={
        kioskStyle
          ? {
              ...kioskThemeVars(kioskStyle),
              backgroundColor: kioskStyle.bg,
              color: kioskStyle.text,
            }
          : undefined
      }
    >
      <div
        className={`mx-auto flex w-full max-w-[860px] flex-col gap-5 py-5 ${alignClass}`}
        style={{ paddingLeft: gutter, paddingRight: gutter }}
      >
        <div className="flex w-full flex-col gap-1">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.24em]"
            style={{ opacity: 0.6 }}
          >
            CEK HASIL
          </p>
          <h1
            className="font-display uppercase leading-[0.95] tracking-[-0.02em]"
            style={{
              fontSize: `calc(clamp(1.4rem, 2.8vw, 2rem) * ${kioskStyle?.fontScale ?? 1})`,
              fontFamily: kioskStyle?.fontFamily,
            }}
          >
            {heading}
          </h1>
          <p
            className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em]"
            style={{ opacity: 0.55 }}
          >
            {`${currentPhotos.length} dari ${photoCount} foto · ${retakes} ulang${
              maxRetakes === null ? "" : ` / maks ${maxRetakes}`
            }`}
          </p>
        </div>

        {retaking !== null ? (
          <div className="flex w-full flex-col gap-3">
            <div className="relative flex min-h-[42dvh] items-center justify-center overflow-hidden border-2 border-ink bg-ink">
              {provider === "bridge" ? (
                <p className="max-w-[40ch] p-6 text-center font-mono text-xs uppercase leading-relaxed tracking-[0.08em] text-bg">
                  Kamera bridge siap. Tekan ambil untuk mengganti foto {retaking + 1}.
                </p>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="max-h-full max-w-full object-contain"
                  style={{
                    filter: filterCss(filterId),
                    transform: cameraSettings.mirror_preview !== false ? "scaleX(-1)" : undefined,
                  }}
                />
              )}
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-ink/60">
                  <span
                    className="font-display leading-none text-accent"
                    style={{ fontSize: "clamp(5rem, 20vw, 10rem)" }}
                  >
                    {countdown}
                  </span>
                </div>
              )}
            </div>
            {error && (
              <p
                role="alert"
                className="border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2.5">
              <KioskAction
                tone="primary"
                size="lg"
                onClick={() => void captureRetake()}
                disabled={!cameraReady || countdown !== null}
                style={
                  kioskStyle
                    ? {
                        borderRadius: kioskStyle.radius,
                        backgroundColor: kioskStyle.accent,
                        color: kioskStyle.accentText,
                      }
                    : undefined
                }
              >
                <Camera className="size-5" aria-hidden /> Ambil foto {retaking + 1}
              </KioskAction>
              <KioskAction
                tone="secondary"
                size="lg"
                onClick={cancelRetake}
                style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}
              >
                Batal
              </KioskAction>
            </div>
          </div>
        ) : (
          <>
            <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-3">
              {currentPhotos.map((photo, index) => (
                <figure
                  key={index}
                  className="flex flex-col gap-2 border-2 border-ink bg-surface p-2"
                >
                  {urls[index] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urls[index]!}
                      alt={`Foto ${index + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-[3/4] w-full bg-muted" aria-hidden />
                  )}
                  <button
                    type="button"
                    onClick={() => startRetake(index)}
                    disabled={!canRetake}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 border-2 border-ink bg-bg px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-ink disabled:opacity-40"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {`Ulang foto ${index + 1}`}
                  </button>
                </figure>
              ))}
            </div>

            {!canRetake && (
              <p className="w-full border-2 border-dashed border-ink/40 bg-muted px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
                Batas retake sudah tercapai.
              </p>
            )}

            <KioskAction
              tone="primary"
              size="xl"
              full
              onClick={() => onContinue(currentPhotos, retakes)}
              style={
                kioskStyle
                  ? {
                      borderRadius: kioskStyle.radius,
                      backgroundColor: kioskStyle.accent,
                      color: kioskStyle.accentText,
                    }
                  : undefined
              }
            >
              <Check className="size-6" aria-hidden /> Lanjut edit
            </KioskAction>
          </>
        )}
      </div>
    </div>
  );
}
