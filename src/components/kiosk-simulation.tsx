"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CameraIcon,
  CheckIcon,
  CreditCardIcon,
  FilterIcon,
  FrameIcon,
  ImageIcon,
  PackageIcon,
  QrCodeIcon,
} from "lucide-react";

const packages = [
  { id: "single", label: "Strip tunggal", price: 15000 },
  { id: "double", label: "Strip ganda", price: 25000 },
  { id: "premium", label: "Premium (4 foto)", price: 35000 },
];

const filters = [
  { id: "original", label: "Original" },
  { id: "mono", label: "Mono", className: "grayscale" },
  { id: "warm", label: "Warm", className: "sepia" },
  { id: "vivid", label: "Vivid", className: "saturate-150" },
];

const frames = [
  { id: "plain", label: "Plain" },
  { id: "classic", label: "Classic", className: "border-[12px] border-foreground" },
  { id: "film", label: "Film", className: "border-[10px] border-dashed border-foreground" },
];

type Step = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

const steps: Step[] = [
  { id: "package", label: "Pilih paket", icon: <PackageIcon className="size-4" /> },
  { id: "pay", label: "Bayar", icon: <CreditCardIcon className="size-4" /> },
  { id: "frame", label: "Pilih frame", icon: <FrameIcon className="size-4" /> },
  { id: "capture", label: "Foto", icon: <CameraIcon className="size-4" /> },
  { id: "result", label: "Hasil", icon: <ImageIcon className="size-4" /> },
];

function formatIDR(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

export function KioskSimulation() {
  const [stepIdx, setStepIdx] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState("single");
  const [selectedFilter, setSelectedFilter] = useState("original");
  const [selectedFrame, setSelectedFrame] = useState("plain");
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraOn(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < 2) {
      video.onloadeddata = () => {
        doCapture(video, canvas);
      };
      return;
    }
    doCapture(video, canvas);
  };

  const doCapture = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const size = 480;
    canvas.width = size;
    canvas.height = (size * 4) / 3;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // cover-crop the video into the 3:4 canvas (matches object-cover preview)
    const targetRatio = size / ((size * 4) / 3); // 3/4
    const sourceRatio = vw / vh;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    if (sourceRatio > targetRatio) {
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetRatio;
      sy = (vh - sh) / 2;
    }

    ctx.save();
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    const dataUrl = canvas.toDataURL("image/png");
    setPhoto(dataUrl);
    stopCamera();
  };

  const startCountdown = () => {
    if (countdown !== null) return;
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c === null || c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          capture();
          return null;
        }
        return c - 1;
      });
    }, 1000);
  };

  const simulatePayment = () => {
    setPaying(true);
    setTimeout(() => {
      setPaying(false);
      setPaid(true);
    }, 1400);
  };

  const goTo = (i: number) => {
    if (i === stepIdx + 1) {
      const current = steps[stepIdx];
      if (current?.id === "pay") simulatePayment();
      if (current?.id === "capture") void startCamera();
      setStepIdx(i);
    }
  };

  const reset = () => {
    setStepIdx(0);
    setPhoto(null);
    setPaid(false);
    setCountdown(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    stopCamera();
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 md:px-8">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-10">
        {/* Left: steps */}
        <div className="min-w-0 space-y-6">
          <ol className="space-y-1.5">
            {steps.map((s, i) => {
              const done = i < stepIdx;
              const active = i === stepIdx;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => goTo(i)}
                    disabled={i > stepIdx + 1 || (i < stepIdx && !paid)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-none border-2 border-ink px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-foreground bg-background text-foreground"
                        : done
                          ? "border-border bg-background text-foreground"
                          : "border-border bg-background text-muted-foreground",
                      i > stepIdx + 1 && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-none border-2 border-ink",
                        active
                          ? "bg-foreground text-background"
                          : done
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {done ? <CheckIcon className="size-4" /> : s.icon}
                    </div>
                    <span className="text-sm font-medium">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Package / frame / filter selectors */}
          <div className="space-y-5">
            {stepIdx === 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Pilih paket (harga contoh)
                </p>
                <div className="flex flex-col gap-2">
                  {packages.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPackage(p.id)}
                      className={cn(
                        "flex min-h-11 items-center justify-between rounded-none border-2 border-ink px-3 py-2 text-sm transition-colors",
                        selectedPackage === p.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      )}
                    >
                      <span className="font-medium">{p.label}</span>
                      <span className="text-xs opacity-70">{formatIDR(p.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stepIdx === 1 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Pembayaran QRIS</p>
                <div className="flex flex-col items-center gap-3 rounded-none border-2 border-ink bg-surface p-4">
                  {!paid ? (
                    <>
                      <div className="flex size-24 items-center justify-center rounded-none border-2 border-ink bg-muted">
                        <QrCodeIcon className="size-12 text-foreground" />
                      </div>
                      <Button size="sm" onClick={simulatePayment} disabled={paying}>
                        {paying ? "Memproses..." : "Simulasikan pembayaran"}
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <CheckIcon className="size-8 text-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        Pembayaran berhasil
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatIDR(packages.find((p) => p.id === selectedPackage)?.price ?? 0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {stepIdx === 2 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Pilih frame</p>
                <div className="grid grid-cols-3 gap-2">
                  {frames.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFrame(f.id)}
                      className={cn(
                        "flex min-h-20 flex-col items-center justify-center gap-2 rounded-none border-2 border-ink px-2 py-2 text-xs font-medium transition-colors",
                        selectedFrame === f.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <span
                        className={cn("box-border block size-9 shrink-0 bg-muted", f.className)}
                        aria-hidden
                      />
                      {f.label}
                    </button>
                  ))}
                </div>
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Pratinjau di samping berubah saat frame dipilih.
                </p>
              </div>
            )}

            {stepIdx === 3 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Pilih filter</p>
                <div className="flex flex-wrap gap-2">
                  {filters.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFilter(f.id)}
                      className={cn(
                        "flex min-h-11 items-center gap-1.5 rounded-none border-2 border-ink px-3 py-1.5 text-xs font-medium transition-colors",
                        selectedFilter === f.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {f.id === "original" ? (
                        <ImageIcon className="size-3.5" />
                      ) : (
                        <FilterIcon className="size-3.5" />
                      )}
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setMirror((m) => !m)}
                  className={cn(
                    "mt-2 flex min-h-11 items-center gap-1.5 rounded-none border-2 border-ink px-3 py-1.5 text-xs font-medium transition-colors",
                    mirror
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <ImageIcon className="size-3.5" />
                  {mirror ? "Cermin aktif" : "Cermin mati"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: camera / result */}
        <div className="min-w-0 space-y-4">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[420px] overflow-hidden rounded-none border-2 border-ink bg-muted">
            {stepIdx === 2 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background p-5 sm:p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Pratinjau frame
                </p>
                <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
                  <div
                    className={cn(
                      "relative flex aspect-[3/4] max-h-full w-[min(62%,220px)] min-w-[120px] items-center justify-center overflow-hidden bg-muted box-border",
                      frames.find((f) => f.id === selectedFrame)?.className
                    )}
                  >
                    <div className="flex h-full w-full items-center justify-center border border-dashed border-foreground/30 bg-muted/70">
                      <div className="text-center">
                        <ImageIcon className="mx-auto size-8 text-muted-foreground" />
                        <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                          Area foto
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                  {frames.find((f) => f.id === selectedFrame)?.label} frame
                </p>
                <p className="text-center text-xs text-muted-foreground">
                  Frame ini akan dipakai pada hasil foto.
                </p>
              </div>
            ) : photo ? (
              <div className="absolute inset-0 flex flex-col p-4">
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                  <div
                    className={cn(
                      "box-border max-h-full max-w-full overflow-hidden bg-background",
                      frames.find((f) => f.id === selectedFrame)?.className
                    )}
                  >
                    <img
                      src={photo}
                      alt="Hasil foto"
                      className={cn(
                        "block max-h-full max-w-full object-contain",
                        filters.find((f) => f.id === selectedFilter)?.className
                      )}
                    />
                  </div>
                </div>
                {stepIdx === 4 && (
                  <div className="mt-3 flex items-center gap-3 rounded-none border-2 border-ink bg-surface px-3 py-2">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
                      <QrCodeIcon className="size-7 text-foreground" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-foreground">Ambil hasil digital</p>
                      <p className="text-[10px] text-muted-foreground">Scan QR untuk mengunduh</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn(
                    "absolute inset-0 size-full object-cover",
                    mirror && "-scale-x-100",
                    filters.find((f) => f.id === selectedFilter)?.className,
                    !cameraOn && "hidden"
                  )}
                />
                {!cameraOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <CameraIcon className="size-10" />
                    <span className="text-xs">
                      {stepIdx < 3 ? "Kamera siap di langkah Foto" : "Kamera mati"}
                    </span>
                  </div>
                )}

                {/* Countdown overlay */}
                <AnimatePresence>
                  {countdown !== null && (
                    <motion.div
                      key="countdown"
                      initial={{ opacity: 0, scale: 1.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    >
                      <span className="text-7xl font-semibold text-foreground">{countdown}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}

            {/* Corner brackets */}
            {[
              "top-2 left-2 border-t-2 border-l-2",
              "top-2 right-2 border-t-2 border-r-2",
              "bottom-2 left-2 border-b-2 border-l-2",
              "bottom-2 right-2 border-b-2 border-r-2",
            ].map((cls) => (
              <div
                key={cls}
                className={cn("pointer-events-none absolute size-6 border-foreground/40", cls)}
              />
            ))}

            {/* Capture flash */}
            <AnimatePresence>
              {photo && stepIdx === 3 && (
                <motion.div
                  key="flash"
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="pointer-events-none absolute inset-0 bg-white"
                />
              )}
            </AnimatePresence>
          </div>

          <canvas ref={canvasRef} className="hidden" style={{ display: "none" }} />

          <div className="flex flex-wrap gap-2">
            {stepIdx === 3 && !photo && (
              <>
                <Button
                  size="sm"
                  onClick={startCountdown}
                  disabled={!cameraOn || countdown !== null}
                >
                  <CameraIcon />
                  Ambil foto
                </Button>
                <Button
                  size="sm"
                  variant="neutral"
                  onClick={() => void startCamera()}
                  disabled={cameraOn}
                >
                  Nyalakan kamera
                </Button>
              </>
            )}
            {stepIdx === 3 && photo && (
              <>
                <div className="flex items-center gap-2 rounded-none border-2 border-ink bg-surface px-3 py-1.5">
                  <CheckIcon className="size-4 text-foreground" />
                  <span className="text-xs font-medium text-foreground">Foto selesai</span>
                </div>
                <Button size="sm" onClick={() => setStepIdx(4)}>
                  Lihat hasil
                </Button>
              </>
            )}
            {stepIdx === 4 && (
              <Button size="sm" variant="neutral" onClick={reset}>
                Mulai lagi
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
