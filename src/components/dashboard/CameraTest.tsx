"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CircleAlert,
  FlipHorizontal,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { captureFrame } from "@/lib/camera-capture";
import { useObjectUrl } from "@/components/kiosk/use-object-url";
import { CAMERA_ERRORS, cameraErrorKind, resolutionLabel, resolutionWarning } from "@/lib/camera-errors";
import type { CameraSettings } from "@/lib/kiosk-types";
import { setPhotoboxMirrorAction } from "@/server/booth-actions";

type Props = {
  photoboxId: string;
  photoboxName: string;
  cameraSettings: CameraSettings;
  canWrite: boolean;
};

type Stage = "preview" | "review";
type CamError = { message: string; action: string };
type Capture = { blob: Blob };

/**
 * CameraTest — owner tool (docs/05 §5.5). 2-part brutalist layout:
 * kiri = preview/review (dark), kanan = controls + status (light).
 * Foto & retake = ephemeral test; mirror toggle persist ke camera_settings
 * (source of truth kiosk). Menggunakan captureFrame yang sama dengan kiosk.
 */
export function CameraTest({ photoboxId, photoboxName, cameraSettings, canWrite }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("preview");
  const [capture, setCapture] = useState<Capture | null>(null);
  const captureUrl = useObjectUrl(capture?.blob);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<CamError | null>(null);
  const [resW, setResW] = useState(0);

  const [mirror, setMirror] = useState<boolean>(cameraSettings.mirror_preview ?? false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const openStream = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError({ message: "Browser tidak mendukung kamera. Gunakan Chrome terbaru.", action: "COBA LAGI" });
      return;
    }
    stopStream();
    try {
      const ideal = cameraSettings.capture_width || 1920;
      const idealH = cameraSettings.capture_height || 1080;
      const deviceId = cameraSettings.preferred_device_id ?? undefined;
      const constraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId }, width: { ideal }, height: { ideal: idealH } } }
        : { video: { width: { ideal }, height: { ideal: idealH } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (e) {
      const kind = cameraErrorKind(e instanceof DOMException ? e.name : null);
      if (kind) {
        setError({ message: CAMERA_ERRORS[kind].message, action: CAMERA_ERRORS[kind].action });
      } else {
        setError({ message: "Gagal membuka kamera. Coba lagi.", action: "COBA LAGI" });
      }
    }
  }, [cameraSettings.capture_width, cameraSettings.capture_height, cameraSettings.preferred_device_id, stopStream]);

  // Re-open stream saat setting kamera berubah (capture_*, preferred_device_id).
  // `openStream` sudah useCallback dengan dep tepat, `stopStream` stable — deps
  // effect hanya `openStream` dan `stopStream` (yang menangani cleanup).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await openStream();
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [openStream, stopStream]);

  async function handleCapture() {
    if (!videoRef.current) return;
    try {
      const shot = await captureFrame(videoRef.current, cameraSettings.jpeg_quality || 0.92);
      setCapture(shot);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      setStage("review");
      stopStream();
    } catch {
      setError({ message: "Gagal mengambil foto. Coba lagi.", action: "COBA LAGI" });
      setStage("preview");
    }
  }

  function handleRetake() {
    setCapture(null);
    setStage("preview");
    void openStream();
  }

  async function handleMirror(next: boolean) {
    if (saving) return;
    setMirror(next);
    setSaveError(null);
    setSaving(true);
    const res = await setPhotoboxMirrorAction(photoboxId, next);
    setSaving(false);
    if (!res.ok) {
      setMirror(!next);
      setSaveError(res.error ?? "Gagal menyimpan mirror.");
    }
  }

  const resLabel = resW ? resolutionLabel(resW) : null;
  const resWarn = resW ? resolutionWarning(resW) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:gap-6">
      {/* KIRI — preview / review (dark, frame kamera) */}
      <div className="relative flex min-h-[60dvh] items-center justify-center overflow-hidden border-2 border-ink bg-ink lg:min-h-[70dvh]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => setResW(e.currentTarget.videoWidth)}
          className="max-h-full max-w-full object-contain"
          style={mirror ? { transform: "scaleX(-1)" } : undefined}
        />

        {stage === "review" && capture && captureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={captureUrl}
            alt="Hasil uji foto"
            className="absolute inset-0 max-h-full max-w-full object-contain"
          />
        )}

        {flash && <div className="pointer-events-none absolute inset-0 bg-surface" />}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
            <CircleAlert className="size-10" aria-hidden />
            <p className="max-w-[42ch] font-mono text-sm">{error.message}</p>
            <Button variant="outline" onClick={() => void openStream()}>
              {error.action}
            </Button>
          </div>
        )}

        {/* Corner telemetry */}
        {!error && (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-bg/60">
              {"/// PREVIEW"}
            </span>
            {resLabel && (
              <span className="border border-bg/40 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg/80">
                {resLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* KANAN — controls + status (light) */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {"/// CAMERA TEST"}
          </p>
          <p className="font-display text-2xl uppercase leading-none tracking-tight">
            {photoboxName}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {`PHOTOBOX ID · ${photoboxId.slice(0, 8).toUpperCase()}`}
          </p>
        </div>

        {/* Mirror toggle — persist ke kiosk */}
        <div className="flex flex-col gap-2 border-2 border-ink bg-surface p-4">
          <div className="flex items-center gap-2">
            <FlipHorizontal className="size-4" aria-hidden />
            <p className="font-mono text-xs uppercase tracking-[0.1em]">Mirror preview</p>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          </div>
          <div className="grid grid-cols-2 border-2 border-ink" role="group" aria-label="Mirror preview">
            <button
              type="button"
              onClick={() => void handleMirror(true)}
              disabled={!canWrite || saving}
              aria-pressed={mirror}
              className={`border-r-2 border-ink py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                mirror ? "bg-accent text-ink" : "bg-bg text-muted-foreground hover:bg-muted"
              }`}
            >
              Aktif
            </button>
            <button
              type="button"
              onClick={() => void handleMirror(false)}
              disabled={!canWrite || saving}
              aria-pressed={!mirror}
              className={`py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                !mirror ? "bg-accent text-ink" : "bg-bg text-muted-foreground hover:bg-muted"
              }`}
            >
              Nonaktif
            </button>
          </div>
          {saveError && (
            <p role="alert" className="font-mono text-[10px] uppercase tracking-[0.05em] text-destructive">
              {saveError}
            </p>
          )}
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            Tampilan mirror preview di kiosk. Disimpan otomatis — kiosk ikut pengaturan ini.
          </p>
        </div>

        {/* Capture / retake */}
        <div className="flex flex-col gap-3">
          {stage === "preview" ? (
            <Button
              size="lg"
              onClick={() => void handleCapture()}
              disabled={Boolean(error)}
              className="h-16 bg-accent text-xl shadow-[4px_4px_0_0_#111111] hover:shadow-[2px_2px_0_0_#111111]"
            >
              <Camera className="size-6" aria-hidden /> Ambil foto
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Foto berhasil diambil — uji hasil
              </p>
              <Button size="lg" variant="outline" onClick={handleRetake} className="bg-surface">
                <RotateCcw className="size-5" aria-hidden /> Retake
              </Button>
            </div>
          )}
        </div>

        {/* Status kamera */}
        <div className="flex flex-col gap-1.5 border-t-2 border-ink/10 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {"STATUS KAMERA"}
          </p>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.05em]">Resolusi</span>
            <span className="font-mono text-[11px] font-bold">
              {resW ? `${resW}×${Math.round((resW * 9) / 16)}` : "—"}
            </span>
          </div>
          {resWarn && (
            <p className="border-l-2 border-destructive pl-2 font-mono text-[10px] uppercase tracking-[0.05em] text-destructive">
              {resWarn}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.05em]">Mirror</span>
            <span className="font-mono text-[11px] font-bold">{mirror ? "AKTIF" : "OFF"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
