"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, FlipHorizontal2, RotateCcw } from "lucide-react";
import { cameraErrorCopy } from "@/lib/camera-errors";
import { captureFrame, normalizeRotation, normalizeZoom } from "@/lib/camera-capture";
import {
  captureFromBridge,
  checkCameraBridge,
  fetchBridgePreview,
  resolveCameraProvider,
  resolveFacingMode,
} from "@/lib/camera-provider";
import { getBridgeToken } from "@/lib/bridge-token";
import { getDeviceProfile } from "@/lib/device-profile";
import {
  FILTER_PRESETS,
  filterCss,
  kioskThemeVars,
  type CameraSettings,
  type CapturePhoto,
  type KioskVisualStyle,
} from "@/lib/kiosk-types";
import type { TemplateLayout } from "@/lib/template-layout";
import type { KioskElementsConfig } from "@/lib/kiosk-elements";
import { kioskElementText, resolveKioskElement } from "@/lib/kiosk-elements";
import { useObjectUrl } from "@/components/kiosk/use-object-url";
import { FramePreviewPanel } from "@/components/kiosk/FramePreviewPanel";
import { KioskAction, kioskGutter } from "@/components/kiosk/ui";
import { KioskElement } from "@/components/kiosk/KioskElement";

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
  /** Dipanggil saat state mirror berubah — induk menyimpan agar review ikut. */
  onMirrorChange?: (mirror: boolean) => void;
  /** Video promo background layar kamera (loop, muted) — null = tanpa video. */
  videoUrl?: string | null;
  /** Layout slot template terpilih — null = tanpa frame (tanpa preview frame). */
  layout?: TemplateLayout | null;
  /** PNG frame transparan template terpilih — dipakai preview frame langsung. */
  frameUrl?: string | null;
  /** Mode capture package — `burst` melewati layar review antar shot. */
  captureMode?: "single" | "burst" | "photostrip";
  /**
   * Foto otomatis: mulai hitung mundur sendiri setelah kamera siap dan lanjut
   * ke slot berikutnya tanpa tombol per foto. Bisa dijeda operator.
   */
  autoCapture?: boolean;
  /** Filter live (CSS) di preview; nilai awal editor. */
  filterId?: string;
  onFilterChange?: (filterId: string) => void;
  onProgress?: (photos: CapturePhoto[], retakeCount: number) => void;
  onComplete: (photos: CapturePhoto[], retakeCount: number) => void;
  /** Kustomisasi elemen layar (Branding & Kiosk). */
  elements?: KioskElementsConfig;
};

type Stage = "preview" | "countdown" | "review";

/** Camera runtime — docs/05 §5.5–5.8 (countdown + capture + review/retake).
 *  2-part kiosk layout: left = camera preview, right = controls/progress. */
function CameraCaptureInner({
  cameraSettings,
  photoCount,
  maxRetakes = null,
  titleText,
  hintText,
  kioskStyle,
  showMirrorToggle = true,
  onMirrorChange,
  videoUrl = null,
  layout = null,
  frameUrl = null,
  captureMode = "single",
  autoCapture = false,
  filterId = "original",
  onFilterChange,
  onProgress,
  onComplete,
  elements,
}: Props) {
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
  // Operator bisa menghentikan rangkaian otomatis tanpa keluar dari sesi.
  const [autoPaused, setAutoPaused] = useState(false);
  // Timer jeda singkat antar shot otomatis — dibatalkan saat stage berubah.
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kalibrasi studio: rotasi & zoom kamera yang dipasang miring/terlalu lebar.
  const rotation = normalizeRotation(cameraSettings.rotation_degrees);
  const calibrationZoom = normalizeZoom(cameraSettings.zoom);
  const [cameraReady, setCameraReady] = useState(false);
  const [bridgePreviewBlob, setGphotoPreviewBlob] = useState<Blob | null>(null);
  const bridgePreviewUrl = useObjectUrl(bridgePreviewBlob);
  const cameraProvider = resolveCameraProvider(cameraSettings);
  // `action` = label tombol; `onAction` = yang benar-benar dijalankan. Tanpa
  // pemisahan ini, error batas retake (satu-satunya jalur keluar dari review)
  // menampilkan "LANJUTKAN" tapi tombolnya membuka ulang kamera — customer
  // terjebak tanpa cara melanjutkan sesi.
  const [error, setError] = useState<{
    message: string;
    action: string;
    onAction?: () => void;
  } | null>(null);
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

  // Teruskan state mirror ke induk — ReviewScreen memakainya untuk retake
  // supaya preview dan hasil capture identik.
  useEffect(() => {
    onMirrorChange?.(mirror);
  }, [mirror, onMirrorChange]);

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
      if (cameraProvider === "bridge") {
        try {
          const result = await checkCameraBridge(cameraSettings);
          if (!result.ok || !result.camera)
            throw new Error(result.message || "Kamera bridge tidak terdeteksi.");
          setCameraReady(true);
        } catch (e) {
          setError({
            message: e instanceof Error ? e.message : "Bridge kamera tidak siap.",
            action: "COBA LAGI",
          });
        }
        return;
      }
      clearReconnectTimers();
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({
          message: "Browser tidak mendukung kamera. Gunakan Chrome terbaru.",
          action: "COBA LAGI",
        });
        return;
      }
      stopStream();
      const ideal = cameraSettings.capture_width || 1920;
      const idealH = cameraSettings.capture_height || 1080;
      // Setting owner (`camera_settings.facingMode`) menang bila valid;
      // fallback device-profile (tablet kiosk = belakang, phone selfie = depan).
      // deviceId eksplisit menang di atas facing mode.
      const facing = resolveFacingMode(
        cameraSettings.facingMode,
        getDeviceProfile().defaultFacingMode
      );
      try {
        const constraints: MediaStreamConstraints = deviceId
          ? {
              video: {
                deviceId: { exact: deviceId },
                width: { ideal: ideal },
                height: { ideal: idealH },
              },
            }
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
        const copy = cameraErrorCopy(name);
        setError({ message: copy.message, action: copy.action });
      }
    },
    [cameraSettings, cameraProvider, onTrackEnded, stopStream]
  );

  useEffect(() => {
    const t = setTimeout(() => void openStream(cameraSettings.preferred_device_id ?? undefined), 0);
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
    // Tanpa daftar deps, listener dicopot-dipasang tiap render — di sesi foto
    // yang progress-nya berubah terus, itu ribuan pasang-copot per menit.
  }, [cameraProvider, openStream, cameraSettings.preferred_device_id]);

  // Watchdog: track mati di tengah sesi (USB goyang, power save) → reconnect
  // otomatis tanpa menunggu event devicechange (yang kadang tak ter-pause).
  // Tidak berlaku saat error tampil (permission denied dsb.) — hindari loop.
  useEffect(() => {
    if (cameraProvider === "bridge") return;
    const id = setInterval(() => {
      if (stage !== "preview" || error) return;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") {
        void openStream(cameraSettings.preferred_device_id ?? undefined);
      }
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraProvider, stage, error]);

  useEffect(() => {
    if (!getBridgeToken()) return;
    if (cameraProvider !== "bridge" || stage === "review" || error) return;
    let cancelled = false;
    let previewInFlight = false;
    const refresh = async () => {
      if (previewInFlight) return;
      previewInFlight = true;
      try {
        const blob = await fetchBridgePreview(cameraSettings);
        if (!cancelled) setGphotoPreviewBlob(blob);
      } catch {
        if (!cancelled) setGphotoPreviewBlob(null);
      } finally {
        previewInFlight = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cameraProvider, cameraSettings, stage, error]);

  function startCountdown() {
    if (!cameraReady) return;
    // Tombol manual / auto-start bisa bertemu timer jeda yang sama: hanya satu
    // rangkaian hitung mundur yang boleh berjalan.
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
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

  // Ref agar effect auto tidak bergantung pada identitas fungsi startCountdown
  // yang berubah tiap render (effect cukup dipicu perubahan stage/data).
  const startCountdownRef = useRef(startCountdown);
  startCountdownRef.current = startCountdown;

  // Foto otomatis: mulai sendiri saat kamera siap dan setelah setiap shot.
  // Jeda 900ms memberi waktu preview frame memperbarui slot sebelum hitung
  // mundur berikutnya. Error menghentikan rangkaian agar tidak retry tanpa henti.
  useEffect(() => {
    if (!autoCapture || autoPaused || !cameraReady || error) return;
    if (stage !== "preview" || photos.length >= photoCount) return;
    if (autoTimerRef.current !== null) return;
    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null;
      startCountdownRef.current();
    }, 900);
    return () => {
      if (autoTimerRef.current !== null) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [autoCapture, autoPaused, cameraReady, error, stage, photos.length, photoCount, slot]);

  async function doCapture() {
    // Guard: countdown terhenti (kamera reconnect di tengah hitung) → jangan
    // ambil frame dari stream yang baru/baru tersambung.
    if (stageRef.current !== "countdown") return;
    try {
      const photo =
        cameraProvider === "bridge"
          ? { blob: await captureFromBridge(cameraSettings) }
          : await captureFrame(
              videoRef.current!,
              cameraSettings.jpeg_quality || 0.92,
              // WYSIWYG: piksel capture mengikuti state mirror preview.
              mirror,
              normalizeRotation(cameraSettings.rotation_degrees),
              normalizeZoom(cameraSettings.zoom)
            );
      setFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlash(false), 180);
      if (autoCapture) {
        // Foto otomatis: tanpa layar review antar shot. Shot terakhir menutup
        // capture; effect di atas menjadwalkan hitung mundur berikutnya.
        const next = [...photos, photo];
        setPhotos(next);
        onProgress?.(next, retakeCount);
        if (slot + 1 >= photoCount) {
          onComplete(next, retakeCount);
        } else {
          setSlot(slot + 1);
          setStage("preview");
        }
        return;
      }
      if (captureMode === "burst") {
        // Burst: tanpa layar review — shot langsung masuk slot berikutnya supaya
        // rangkaian cepat tidak terpotong konfirmasi per foto.
        const next = [...photos, photo];
        setPhotos(next);
        onProgress?.(next, retakeCount);
        if (slot + 1 >= photoCount) {
          onComplete(next, retakeCount);
        } else {
          setSlot(slot + 1);
          setStage("preview");
        }
        return;
      }
      setCurrent(photo);
      setStage("review");
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : "Gagal mengambil foto. Coba lagi.",
        action: "COBA LAGI",
      });
      setStage("preview");
    }
  }

  function retake() {
    if (maxRetakes !== null && retakeCount >= maxRetakes) {
      setError({
        message: "Batas retake sudah tercapai. Foto ini yang dipakai.",
        action: "LANJUTKAN",
        onAction: () => {
          setError(null);
          continueNext();
        },
      });
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

  const eyebrowLabel = kioskElementText(
    elements,
    "eyebrow",
    stage === "review" ? "CEK HASIL" : "AMBIL FOTO"
  );
  const titleLabel = kioskElementText(
    elements,
    "title",
    titleText || `Foto ${slot + 1} / ${photoCount}`
  );
  const hintLabel = kioskElementText(
    elements,
    "hint",
    hintText || `${photos.length} terambil${retakeCount > 0 ? `, ${retakeCount} ulang` : ""}`
  );
  const ctaLabel = kioskElementText(
    elements,
    "cta",
    cameraReady ? `Ambil foto ${slot + 1}/${photoCount}` : "Menyiapkan kamera"
  );
  const mirrorLabel = kioskElementText(
    elements,
    "mirror",
    `Mirror ${mirror ? "aktif" : "nonaktif"}`
  );
  const reviewLabel = kioskElementText(
    elements,
    "review",
    slot + 1 >= photoCount ? "Lanjut edit" : "Lanjut"
  );
  // Overlay progres absolut: gaya resolusi diterapkan langsung (tanpa pembungkus
  // div baru) agar posisi absolute bottom-center tidak rusak; transform offset
  // digabung dengan translate(-50%) milik posisi tengah.
  const progress = resolveKioskElement(elements, "progress", 7);
  const progressTransform = progress.style.transform
    ? `translate(-50%, 0) ${progress.style.transform}`
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ink lg:flex-row lg:overflow-hidden">
      {/* Panel kamera: selalu mengisi sisa tinggi. Di layar sempit tinggi
          minimum dipertahankan agar preview tidak gepeng. */}
      <div className="relative flex min-h-[52dvh] flex-1 items-center justify-center overflow-hidden bg-ink lg:min-h-0">
        {videoUrl && stage === "preview" && (
          <video
            src={videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-20"
            aria-hidden
          />
        )}
        {stage === "review" && current && currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt="Hasil foto"
            className="max-h-full max-w-full object-contain"
            style={{ filter: filterCss(filterId) }}
          />
        ) : cameraProvider === "bridge" ? (
          bridgePreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bridgePreviewUrl}
              alt="Preview kamera bridge"
              className="max-h-full max-w-full object-contain"
              style={{ filter: filterCss(filterId) }}
            />
          ) : (
            <div className="flex max-w-[34ch] flex-col items-center gap-3 px-6 text-center text-bg">
              <Camera className="size-9" aria-hidden />
              <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em]">
                Preview live kamera tidak tersedia. Kamera tetap siap untuk mengambil foto.
              </p>
            </div>
          )
        ) : (
          <>
            <video
              ref={setVideoEl}
              autoPlay
              playsInline
              muted
              onLoadedData={() => setCameraReady(true)}
              className="max-h-full max-w-full object-contain"
              // Preview = hasil capture: rotasi kalibrasi, mirror, lalu zoom.
              // CSS transform tidak memengaruhi drawImage, tapi di sini keduanya
              // harus tampak sama bagi customer.
              style={{
                filter: filterCss(filterId),
                transform:
                  [
                    mirror ? "scaleX(-1)" : "",
                    rotation ? `rotate(${rotation}deg)` : "",
                    calibrationZoom !== 1 ? `scale(${calibrationZoom})` : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined,
              }}
            />
          </>
        )}

        {stage === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/60">
            <span
              className="font-display leading-none text-accent"
              style={{ fontSize: "clamp(6rem, 22vw, 14rem)" }}
              aria-live="polite"
            >
              {count}
            </span>
          </div>
        )}

        {flash && <div className="pointer-events-none absolute inset-0 bg-surface" />}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
            <Camera className="size-9" aria-hidden />
            <p className="max-w-[42ch] text-sm leading-relaxed">{error.message}</p>
            <KioskAction
              tone="secondary"
              size="md"
              onClick={() => {
                if (error.onAction) {
                  error.onAction();
                  return;
                }
                void openStream(cameraSettings.preferred_device_id ?? undefined);
              }}
            >
              {error.action}
            </KioskAction>
            <p className="max-w-[42ch] font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
              Masih gagal? Panggil petugas untuk mereset sesi.
            </p>
          </div>
        )}

        {/* Progress dots overlay (bottom of preview) */}
        <div
          data-kiosk-element="progress"
          hidden={progress.hidden}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2"
          role="status"
          style={{ order: progress.order, transform: progressTransform }}
          aria-label={`Foto ${photos.length} dari ${photoCount} terambil`}
        >
          {Array.from({ length: photoCount }).map((_, i) => (
            <span
              key={i}
              className={`h-2 w-6 border border-bg/80 ${i < photos.length ? "bg-accent" : "bg-ink/40"}`}
              aria-hidden
            />
          ))}
        </div>
      </div>

      {/* Panel kontrol: chrome mengikuti kustomisasi kiosk; area kamera tetap
          gelap agar kontras preview/retake. bg-ink fallback dipakai saat
          kioskStyle tidak ada (inline style menang bila ada). */}
      <div
        className={`flex shrink-0 flex-col gap-5 overflow-y-auto border-t-2 border-bg/20 bg-ink p-5 lg:min-h-0 lg:w-[38%] lg:shrink lg:border-l-2 lg:border-t-0 lg:justify-start lg:p-6 ${
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
            ? {
                ...kioskThemeVars(kioskStyle),
                backgroundColor: kioskStyle.bg,
                color: kioskStyle.text,
                padding: kioskGutter(kioskStyle.padding),
                borderColor: "currentColor",
              }
            : undefined
        }
      >
        <div className="flex w-full flex-col gap-1.5">
          <KioskElement id="eyebrow" defaultOrder={0} elements={elements}>
            <p
              className="font-mono text-[10px] font-bold uppercase leading-none tracking-[0.24em]"
              style={{ opacity: 0.6, color: kioskStyle ? kioskStyle.text : undefined }}
            >
              {eyebrowLabel}
            </p>
          </KioskElement>
          <KioskElement id="title" defaultOrder={1} elements={elements}>
            <p
              className="font-display uppercase leading-[0.95] tracking-[-0.02em]"
              style={{
                fontSize: `calc(clamp(1.35rem, 2.6vw, 1.9rem) * ${kioskStyle?.fontScale ?? 1})`,
                color: kioskStyle ? kioskStyle.text : undefined,
                fontFamily: kioskStyle?.fontFamily,
              }}
            >
              {titleLabel}
            </p>
          </KioskElement>
          <KioskElement id="hint" defaultOrder={2} elements={elements}>
            <p
              className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em]"
              style={{ opacity: 0.55, color: kioskStyle ? kioskStyle.text : undefined }}
            >
              {hintLabel}
            </p>
          </KioskElement>
        </div>

        {/* Preview frame langsung: slot terisi = hasil foto, slot aktif = kamera.
            Template legacy tanpa slot tetap tampil (frame jadi kanvas preview). */}
        {(layout || frameUrl) && (
          <KioskElement id="frame" defaultOrder={3} elements={elements} className="w-full">
            <FramePreviewPanel
              layout={layout}
              frameUrl={frameUrl}
              captured={capturedBlobs}
              activeSlot={slot}
              videoEl={stage === "review" ? null : videoEl}
              liveImageUrl={
                stage === "review" || cameraProvider !== "bridge" ? null : bridgePreviewUrl
              }
              activeOverride={stage === "review" && current ? current.blob : null}
              mirror={mirror}
              kioskStyle={kioskStyle}
            />
          </KioskElement>
        )}

        {stage === "preview" && !error && (
          <div className="flex w-full flex-col gap-2.5">
            <KioskElement id="cta" defaultOrder={4} elements={elements} className="w-full">
              <KioskAction
                tone="primary"
                size="xl"
                onClick={startCountdown}
                disabled={!cameraReady}
                full
                className="text-xl"
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
                <Camera className="size-7" aria-hidden />
                {ctaLabel}
              </KioskAction>
            </KioskElement>
            {showMirrorToggle && (
              <KioskElement id="mirror" defaultOrder={5} elements={elements} className="w-full">
                <KioskAction
                  tone="secondary"
                  size="md"
                  type="button"
                  aria-pressed={mirror}
                  onClick={() => setMirror((value) => !value)}
                  full
                  className="min-h-12"
                  style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}
                >
                  <FlipHorizontal2 className="size-5" aria-hidden /> {mirrorLabel}
                </KioskAction>
              </KioskElement>
            )}
            {autoCapture && (
              <KioskElement id="auto" defaultOrder={6} elements={elements} className="w-full">
                <KioskAction
                  tone="secondary"
                  size="md"
                  type="button"
                  aria-pressed={autoPaused}
                  onClick={() => setAutoPaused((value) => !value)}
                  full
                  className="min-h-12"
                  style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}
                >
                  {autoPaused ? "Lanjutkan otomatis" : "Jeda otomatis"}
                </KioskAction>
              </KioskElement>
            )}
            {onFilterChange && (
              <KioskElement
                id="filters"
                defaultOrder={7}
                elements={elements}
                className="flex w-full flex-col gap-1.5"
              >
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ opacity: 0.65, color: kioskStyle ? kioskStyle.text : undefined }}
                >
                  Filter live
                </p>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {FILTER_PRESETS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onFilterChange(f.id)}
                      aria-pressed={filterId === f.id}
                      className={`min-h-10 shrink-0 border-2 border-ink px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.02em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                        filterId === f.id ? "bg-accent text-ink" : "bg-surface text-ink"
                      }`}
                      style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </KioskElement>
            )}
          </div>
        )}
        {stage === "review" && current && (
          <KioskElement
            id="review"
            defaultOrder={8}
            elements={elements}
            className="flex w-full flex-col gap-2.5"
          >
            <p
              className="font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ opacity: 0.7, color: kioskStyle ? kioskStyle.text : undefined }}
            >
              Foto berhasil diambil
            </p>
            <div className="flex gap-2.5">
              <KioskAction
                tone="secondary"
                size="lg"
                onClick={retake}
                className="flex-1"
                style={kioskStyle ? { borderRadius: kioskStyle.radius } : undefined}
              >
                <RotateCcw className="size-5" aria-hidden /> Ulang
              </KioskAction>
              <KioskAction
                tone="primary"
                size="lg"
                onClick={continueNext}
                className="flex-1"
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
                {reviewLabel}
              </KioskAction>
            </div>
          </KioskElement>
        )}
      </div>
    </div>
  );
}

/** memo: callback & settings stabil dari KioskApp — stream kamera tak restart
 *  tiap render induk (mount ulang = kamera mati/nyala). */
export const CameraCapture = memo(CameraCaptureInner);
