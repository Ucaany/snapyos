"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, FlipHorizontal2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CAMERA_ERRORS, cameraErrorKind } from "@/lib/camera-errors";
import { captureFrame } from "@/lib/camera-capture";
import { resolveFacingMode } from "@/lib/camera-provider";
import { getDeviceProfile } from "@/lib/device-profile";
import type { CameraSettings, CapturePhoto, KioskVisualStyle } from "@/lib/kiosk-types";
import type { TemplateLayout } from "@/lib/template-layout";
import { useObjectUrl } from "@/components/kiosk/use-object-url";
import { FramePreviewPanel } from "@/components/kiosk/FramePreviewPanel";

type Props = {
  cameraSettings: CameraSettings;
  photoCount: number;
  maxRetakes?: number | null;
  /** Teks kustom owner (Branding & Kiosk) — kosong = default. */
  titleText?: string;
  hintText?: string;
  /** Gaya visual kustom per layar (Branding & Kiosk) — chrome panel mengikuti. */
  kioskStyle?: KioskVisualStyle;
  /** Tampilkan tombol mirror di layar customer (default true). */
  showMirrorToggle?: boolean;
  /** Video promo background layar kamera (loop, muted) — null = tanpa video. */
  videoUrl?: string | null;
  /** Layout slot template terpilih — null = tanpa frame (tanpa preview frame). */
  layout?: TemplateLayout | null;
  /** PNG frame transparan template terpilih — dipakai preview frame langsung. */
  frameUrl?: string | null;
  onProgress?: (photos: CapturePhoto[], retakeCount: number) => void;
  onComplete: (photos: CapturePhoto[], retakeCount: number) => void;
};

type Stage = "preview" | "countdown" | "review";

/** Camera runtime — docs/05 §5.5–5.8 (countdown + capture + review/retake).
 *  2-part kiosk layout: left = camera preview, right = controls/progress. */
function CameraCaptureInner({ cameraSettings, photoCount, maxRetakes = null, titleText, hintText, kioskStyle, showMirrorToggle = true, videoUrl = null, layout = null, frameUrl = null, onProgress, onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("preview");
  const [slot, setSlot] = useState(0);
  const [photos, setPhotos] = useState<CapturePhoto[]>([]);
  // Elemen <video> dibagikan ke preview frame; node <video> berganti saat
  // stage review -> preview, jadi simpan node-nya di state (bukan hanya ref).
  const [videoEl, setVideoElState] = useState<HTMLVideoElement | null>(null);
  const [retakeCount, setRetakeCount] = useState(0);
  const [count, setCount] = useState(3);
  const [current, setCurrent] = useState<CapturePhoto | null>(null);
  const currentUrl = useObjectUrl(current?.blob);
  /** Blob foto yang sudah dikonfirmasi — stabil agar efek load preview tak
   *  re-run tiap render (array baru = object URL dibuat ulang terus). */
  const capturedBlobs = useMemo(() => photos.map((p) => p.blob), [photos]);
  const [flash, setFlash] = useState(false);
  // stage di-ref: doCapture dipanggil dari setInterval yang dibuat saat stage
  // masih "preview" — closure `stage` basi, guard selalu early-return.
  const stageRef = useRef<Stage>("preview");
  const [mirror, setMirror] = useState(cameraSettings.mirror_preview !== false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<{ message: string; action: string } | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamGeneration = useRef(0);
  // Timer reconnect tertunda — dibatalkan saat unmount/sukses agar stream
  // tidak bocor dan retry kedua tidak menghancurkan sesi yang sudah hidup.
  const reconnectTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Timer flash — di-clear saat unmount agar tidak set state dari capture yang ditinggal.
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  /**
   * Callback ref video. Elemen <video> di-unmount saat stage="review"
   * (diganti <img> hasil foto), lalu elemen BARU di-mount saat kembali ke
   * "preview". Node baru tidak mewarisi srcObject → tanpa re-attach di sini,
   * capture slot ke-2+ gagal ("Kamera belum siap"). Pasang kembali stream yang
   * masih hidup di streamRef setiap kali node video (re)mount.
   */
  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoElState(el);
    if (!el) return;
    setCameraReady(false);
    const stream = streamRef.current;
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  function clearReconnectTimers() {
    for (const t of reconnectTimersRef.current) clearTimeout(t);
    reconnectTimersRef.current = [];
  }

  // Reconnect otomatis saat kamera USB cabut/goyang — dipanggil dari
  // track "ended" + devicechange + watchdog interval. Retry dua kali
  // (kamera USB butuh waktu re-enumerate setelah dicabut).
  const reconnectRef = useRef<() => void>(() => undefined);
  const onTrackEnded = useCallback(() => reconnectRef.current(), []);

  const openStream = useCallback(
    async (deviceId?: string) => {
      const generation = ++streamGeneration.current;
      setError(null);
      setCameraReady(false);
      clearReconnectTimers();
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({ message: "Browser tidak mendukung kamera. Gunakan Chrome terbaru.", action: "COBA LAGI" });
        return;
      }
      stopStream();
      const ideal = cameraSettings.capture_width || 1920;
      const idealH = cameraSettings.capture_height || 1080;
      // Setting owner (`camera_settings.facingMode`) menang bila valid;
      // fallback device-profile (tablet kiosk = belakang, phone selfie = depan).
      // deviceId eksplisit menang di atas facing mode.
      const facing = resolveFacingMode(cameraSettings.facingMode, getDeviceProfile().defaultFacingMode);
      try {
        const constraints: MediaStreamConstraints = deviceId
          ? { video: { deviceId: { exact: deviceId }, width: { ideal: ideal }, height: { ideal: idealH } } }
          : { video: { facingMode: facing, width: { ideal: ideal }, height: { ideal: idealH } } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (generation !== streamGeneration.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        // Track berakhir tiba-tiba (USB lepas) → reconnect segera.
        stream.getVideoTracks()[0]?.addEventListener("ended", onTrackEnded, { once: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        const name = e instanceof DOMException ? e.name : null;
        // Device id basi (kamera diganti/re-enumerate OS) → fallback kamera
        // default sekali, jangan biarkan kiosk stuck di error.
        if (name === "OverconstrainedError" && deviceId) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: facing, width: { ideal: ideal }, height: { ideal: idealH } },
            });
            if (generation !== streamGeneration.current) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            streamRef.current = stream;
            stream.getVideoTracks()[0]?.addEventListener("ended", onTrackEnded, { once: true });
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              await videoRef.current.play().catch(() => undefined);
            }
            return;
          } catch {
            // jatuh ke penanganan error umum di bawah
          }
        }
        const kind = cameraErrorKind(name);
        if (kind) {
          setError({ message: CAMERA_ERRORS[kind].message, action: CAMERA_ERRORS[kind].action });
        } else {
          setError({ message: "Gagal membuka kamera. Coba lagi.", action: "COBA LAGI" });
        }
      }
    },
    [cameraSettings.capture_width, cameraSettings.capture_height, cameraSettings.facingMode, onTrackEnded, stopStream]
  );

  useEffect(() => {
    const t = setTimeout(
      () => void openStream(cameraSettings.preferred_device_id ?? undefined),
      0
    );
    return () => {
      clearTimeout(t);
      clearReconnectTimers();
      stopStream();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reconnectRef.current = () => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") {
        // USB cabut/ganti → reconnect otomatis (retry singkat; kamera USB
        // butuh waktu re-enumerate). Gagal tetap tampilkan error + tombol.
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        setStage("preview");
        clearReconnectTimers();
        // Guard retry kedua: bila 800ms sudah berhasil, jangan bongkar lagi.
        reconnectTimersRef.current = [
          setTimeout(() => void openStream(cameraSettings.preferred_device_id ?? undefined), 800),
          setTimeout(() => {
            const t = streamRef.current?.getVideoTracks()[0];
            if (!t || t.readyState === "ended")
              void openStream(cameraSettings.preferred_device_id ?? undefined);
          }, 2500),
        ];
      }
    };
    const handleDeviceChange = () => reconnectRef.current();
    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
  });

  // Watchdog: track mati di tengah sesi (USB goyang, power save) → reconnect
  // otomatis tanpa menunggu event devicechange (yang kadang tak ter-pause).
  // Tidak berlaku saat error tampil (permission denied dsb.) — hindari loop.
  useEffect(() => {
    const id = setInterval(() => {
      if (stage !== "preview" || error) return;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") {
        void openStream(cameraSettings.preferred_device_id ?? undefined);
      }
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, error]);

  function startCountdown() {
    if (!cameraReady) return;
    const seconds = Math.max(1, cameraSettings.countdown_seconds || 3);
    let remaining = seconds;
    stageRef.current = "countdown";
    setCount(seconds);
    setStage("countdown");
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCount(remaining);
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        void doCapture();
      }
    }, 1000);
  }

  async function doCapture() {
    // Guard: countdown terhenti (kamera reconnect di tengah hitung) → jangan
    // ambil frame dari stream yang baru/baru tersambung.
    if (!videoRef.current || stageRef.current !== "countdown") return;
    try {
      const photo = await captureFrame(videoRef.current, cameraSettings.jpeg_quality || 0.92, mirror);
      setCurrent(photo);
      setFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlash(false), 180);
      setStage("review");
    } catch {
      setError({ message: "Gagal mengambil foto. Coba lagi.", action: "COBA LAGI" });
      setStage("preview");
    }
  }

  function retake() {
    if (maxRetakes !== null && retakeCount >= maxRetakes) {
      setError({ message: "Batas retake sudah tercapai.", action: "LANJUTKAN" });
      return;
    }
    const nextRetakes = retakeCount + 1;
    setRetakeCount(nextRetakes);
    onProgress?.(photos, nextRetakes);
    setCurrent(null);
    setStage("preview");
  }

  function continueNext() {
    if (!current) return;
    const next = [...photos, current];
    setPhotos(next);
    onProgress?.(next, retakeCount);
    setCurrent(null);
    if (slot + 1 >= photoCount) {
      onComplete(next, retakeCount);
    } else {
      setSlot(slot + 1);
      setStage("preview");
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-y-auto bg-ink lg:flex-row lg:overflow-hidden">
      {/* Left panel — camera preview / review */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-ink">
        {videoUrl && stage === "preview" && (
          <video
            src={videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-25"
            aria-hidden
          />
        )}
        {stage === "review" && current && currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="Hasil foto" className="max-h-full max-w-full object-contain" />
        ) : (
          <>
            <video
              ref={setVideoEl}
              autoPlay
              playsInline
              muted
              onLoadedData={() => setCameraReady(true)}
              className="max-h-full max-w-full object-contain"
              style={mirror ? { transform: "scaleX(-1)" } : undefined}
            />
            {stage === "countdown" && (
              <div className="absolute inset-0 flex items-center justify-center bg-ink/60">
                <span className="font-display text-[10rem] leading-none text-accent md:text-[14rem]">{count}</span>
              </div>
            )}
          </>
        )}

        {flash && <div className="pointer-events-none absolute inset-0 bg-white" />}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
            <Camera className="size-10" aria-hidden />
            <p className="max-w-[42ch] font-mono text-sm">{error.message}</p>
            <Button
              variant="outline"
              onClick={() => void openStream(cameraSettings.preferred_device_id ?? undefined)}
            >
              {error.action}
            </Button>
            <p className="max-w-[42ch] font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Masih gagal? Panggil petugas untuk mereset sesi.
            </p>
          </div>
        )}

        {/* Progress dots overlay (bottom of preview) */}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          {Array.from({ length: photoCount }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 border border-bg ${i < photos.length ? "bg-accent" : "bg-transparent"}`}
              aria-hidden
            />
          ))}
        </div>
      </div>

      {/* Right panel — controls + progress (chrome mengikuti kustomisasi kiosk;
          area kamera tetap gelap agar kontras preview/retake). bg-ink fallback
          dipakai saat kioskStyle tidak ada (inline style menang bila ada). */}
      <div
        className={`flex shrink-0 flex-col gap-5 border-t-2 border-bg bg-ink p-6 lg:w-[38%] lg:border-l-2 lg:border-t-0 lg:justify-center lg:p-8 ${
          kioskStyle
            ? kioskStyle.align === "left"
              ? "items-start text-left"
              : kioskStyle.align === "right"
                ? "items-end text-right"
                : "items-center text-center"
            : "items-start"
        }`}
        style={
          kioskStyle
            ? { backgroundColor: kioskStyle.bg, color: kioskStyle.text, padding: kioskStyle.padding, borderColor: "currentColor" }
            : undefined
        }
      >
        <div className="flex flex-col gap-1">
          <p
            className="font-mono text-[10px] uppercase tracking-[0.25em]"
            style={{ opacity: 0.6, color: kioskStyle ? kioskStyle.text : undefined }}
          >
            {"/// CAPTURE"}
          </p>
          <p
            className="font-display text-2xl uppercase leading-none tracking-tight md:text-3xl"
            style={kioskStyle ? { fontSize: `${2 * kioskStyle.fontScale}rem`, color: kioskStyle.text, fontFamily: kioskStyle.fontFamily } : undefined}
          >
            {titleText || `Foto ${slot + 1} / ${photoCount}`}
          </p>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.15em]"
            style={{ opacity: 0.5, color: kioskStyle ? kioskStyle.text : undefined }}
          >
             {hintText || `${photos.length} terambil${retakeCount > 0 ? `, ${retakeCount} ulang` : ""}`}
          </p>
        </div>

        {/* Preview frame langsung: slot terisi = hasil foto, slot aktif = kamera. */}
        {layout && (
          <FramePreviewPanel
            layout={layout}
            frameUrl={frameUrl}
            captured={capturedBlobs}
            activeSlot={slot}
            videoEl={stage === "review" ? null : videoEl}
            activeOverride={stage === "review" && current ? current.blob : null}
            mirror={mirror}
            kioskStyle={kioskStyle}
          />
        )}

        {stage === "preview" && !error && (
          <div className="flex w-full flex-col gap-3">
            <Button
              size="lg"
              onClick={startCountdown}
              disabled={!cameraReady}
              className="h-20 bg-accent-2 text-3xl shadow-[6px_6px_0_0_#111111] hover:shadow-[4px_4px_0_0_#111111]"
              style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}
            >
              <Camera className="size-8" aria-hidden />
              {cameraReady ? `Ambil foto ${slot + 1}/${photoCount}` : "Menyiapkan kamera"}
            </Button>
            {showMirrorToggle && (
              <Button type="button" variant="outline" aria-pressed={mirror} onClick={() => setMirror((value) => !value)} className="min-h-11">
                <FlipHorizontal2 className="size-5" aria-hidden /> Mirror {mirror ? "aktif" : "nonaktif"}
              </Button>
            )}
          </div>
        )}
        {stage === "review" && current && (
          <div className="flex flex-col gap-3">
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.15em]" style={{ opacity: 0.7, color: kioskStyle ? kioskStyle.text : undefined }}>
              Foto berhasil diambil
            </p>
            <Button size="lg" variant="outline" onClick={retake} className="flex-1 bg-bg text-ink" style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}>
              <RotateCcw className="size-6" aria-hidden /> Ulang
            </Button>
            <Button size="lg" onClick={continueNext} className="flex-1 bg-accent-3" style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}>
              {slot + 1 >= photoCount ? "Lanjut edit" : "Lanjut"}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-1.5 border-t-2 pt-4" style={{ borderColor: kioskStyle ? "color-mix(in srgb, currentColor 20%, transparent)" : undefined }}>
          {Array.from({ length: photoCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className={`inline-flex size-6 shrink-0 items-center justify-center border text-[10px] font-bold ${
                  i < photos.length ? "border-accent bg-accent text-ink" : "border-bg/40 text-bg/40"
                }`}
                style={kioskStyle && i >= photos.length ? { borderColor: `color-mix(in srgb, ${kioskStyle.text} 40%, transparent)`, color: `color-mix(in srgb, ${kioskStyle.text} 40%, transparent)` } : undefined}
              >
                {i + 1}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ opacity: 0.5, color: kioskStyle ? kioskStyle.text : undefined }}>
                {i < photos.length ? "Terambil" : i === slot && stage !== "review" ? "Aktif" : "Menunggu"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** memo: callback & settings stabil dari KioskApp — stream kamera tak restart
 *  tiap render induk (mount ulang = kamera mati/nyala). */
export const CameraCapture = memo(CameraCaptureInner);
