"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { PrintTestPanel } from "@/components/print/PrintTestPanel";
import { resolvePrintMode } from "@/lib/print/print-mode";
import type { CameraSettings, PrintSettings } from "@/lib/kiosk-types";
import { Button } from "@/components/ui/button";
import {
  cameraErrorCopy,
  cameraErrorKind,
  resolutionLabel,
  resolutionWarning,
} from "@/lib/camera-errors";
import { getDeviceProfile } from "@/lib/device-profile";
import {
  cameraBridgeUrl,
  captureFromBridge,
  checkCameraBridge,
  resolveCameraProvider,
} from "@/lib/camera-provider";
import { apiPost, KioskError } from "@/components/kiosk/api";
import { BridgeTokenField } from "@/components/kiosk/BridgeTokenField";

type Props = {
  deviceToken: string;
  onDone: () => void;
  /** Token ditolak server (FORBIDDEN) saat report — paksa aktivasi ulang. */
  onAuthError?: () => void;
  /** Setelan cetak booth: menentukan mode uji (dialog OS vs thermal Bluetooth). */
  printSettings?: PrintSettings;
  cameraSettings?: CameraSettings;
};

type Stage = "camera" | "print";

/** Setup Wizard sekali — docs/05 §5.0.1 (permission kamera + detection + print test). */
export function SetupWizard({
  deviceToken,
  onDone,
  onAuthError,
  printSettings = {},
  cameraSettings = {},
}: Props) {
  const [stage, setStage] = useState<Stage>("camera");

  // camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const streamGeneration = useRef(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [resLabel, setResLabel] = useState<string>("");
  const [resWidth, setResWidth] = useState(0);
  const [resWarning, setResWarning] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<{ message: string; action: string } | null>(null);
  const [supported, setSupported] = useState(true);
  // Kamera siap = stream hidup DAN frame pertama sudah tampil. Tanpa flag ini
  // tombol "Lanjut" bisa diklik sebelum `<video>` menerima data (race saat
  // wizard dibuka), lalu wizard terlihat "gagal" padahal kamera normal.
  const [cameraLive, setCameraLive] = useState(false);
  const [cameraCaptureTested, setCameraCaptureTested] = useState(false);

  // print state
  const [printConfirmed, setPrintConfirmed] = useState(false);

  const profile = getDeviceProfile();
  const cameraProvider = resolveCameraProvider(cameraSettings);

  // Copy dinamis per kelas perangkat — tablet kiosk tanpa sebut USB, phone
  // selfie mode, iPad instruksi "Add to Home Screen" (lihat device-profile).
  const deviceCopy = (() => {
    switch (profile.kind) {
      case "phone-android":
      case "phone-ios":
        return {
          hint: "Ponsel mode selfie: kamera depan dipakai otomatis. Pasang ponsel pada dudukan/stand.",
        };
      case "ipad":
        return {
          hint: "iPad: gunakan kamera belakang untuk kualitas terbaik. Pastikan sudah dipasang ke layar utama (Add to Home Screen).",
        };
      default:
        return {
          hint: "Tablet mode: kamera internal dipakai otomatis, tanpa kabel USB.",
        };
    }
  })();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Laporkan payload ke server; FORBIDDEN → token mati, kembali aktivasi. */
  const report = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        await apiPost("/api/v1/public/devices/report", {
          device_token: deviceToken,
          ...payload,
        });
      } catch (e) {
        // Error auth (token revoked/expired) BUKAN transien — jangan biarkan
        // wizard "sukses" palsu; paksa aktivasi ulang.
        if (e instanceof KioskError && e.code === "FORBIDDEN") {
          onAuthError?.();
          return;
        }
        // Error jaringan/validasi lain tidak menggagalkan wizard — device
        // tetap bisa lanjut (report bersifat diagnostik).
      }
    },
    [deviceToken, onAuthError]
  );

  async function openStream(deviceId?: string) {
    const generation = ++streamGeneration.current;
    setCameraError(null);
    setCameraLive(false);
    stopStream();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }
    try {
      const constraints: MediaStreamConstraints = deviceId
        ? {
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          }
        : { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (generation !== streamGeneration.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const track = stream.getVideoTracks()[0];
      if (track) {
        const activeDeviceId = track.getSettings().deviceId;
        if (activeDeviceId) setSelectedId(activeDeviceId);
        const width = track.getSettings().width ?? 0;
        setResLabel(resolutionLabel(width));
        setResWidth(width);
        setResWarning(resolutionWarning(width));
        // Tandai siap setelah track hidup; frame pertama bisa menyusul.
        setCameraLive(track.readyState === "live");
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      if (!deviceId && cams.length === 1) setSelectedId(cams[0]!.deviceId);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : null;
      const kind = cameraErrorKind(name);
      setCameraError(cameraErrorCopy(name));
      // Laporkan kegagalan kamera ke server — diagnostik booth (docs/16 §K2).
      await report({ camera: { error: kind ?? "UNKNOWN" } });
    }
  }

  async function checkBridge() {
    setCameraError(null);
    setCameraLive(false);
    setCameraCaptureTested(false);
    try {
      const result = await checkCameraBridge(cameraSettings);
      if (!result.ok || !result.camera)
        throw new Error(result.message || "Kamera bridge tidak terdeteksi.");
      setResLabel("BRIDGE");
      setCameraLive(true);
      await report({
        camera: { provider: "bridge", status: "ok", bridge_url: cameraBridgeUrl(cameraSettings) },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kamera bridge tidak siap.";
      setCameraError({ message, action: "COBA LAGI" });
      await report({ camera: { provider: "bridge", status: "error", error: message } });
    }
  }

  async function testBridgeCapture() {
    setCameraError(null);
    setCameraCaptureTested(false);
    try {
      const result = await checkCameraBridge(cameraSettings);
      if (!result.ok || !result.camera) {
        throw new Error(result.message || "Kamera bridge tidak terdeteksi.");
      }
      const photo = await captureFromBridge(cameraSettings);
      if (photo.size === 0) throw new Error("Kamera bridge tidak mengembalikan foto.");
      setResLabel("BRIDGE · CAPTURE OK");
      setCameraLive(true);
      setCameraCaptureTested(true);
      await report({
        camera: {
          provider: "bridge",
          status: "ok",
          capture_test: "ok",
          bridge_url: cameraBridgeUrl(cameraSettings),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kamera bridge gagal mengambil foto.";
      setCameraError({ message, action: "COBA LAGI" });
      await report({ camera: { provider: "bridge", status: "error", capture_test: message } });
    }
  }

  useEffect(() => {
    if (cameraProvider === "bridge") {
      const timer = setTimeout(() => void checkBridge(), 0);
      return () => {
        clearTimeout(timer);
        stopStream();
      };
    }
    const t = setTimeout(() => void openStream(), 0);
    return () => {
      clearTimeout(t);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraProvider]);

  async function onCameraNext() {
    const live =
      cameraLive ||
      Boolean(streamRef.current?.getVideoTracks().some((track) => track.readyState === "live"));
    if (!supported || cameraError || !live) {
      // Belum hidup: coba buka ulang, bukan menampilkan error permanen.
      // Error sungguhan (izin ditolak, kamera dipakai app lain) sudah tampil
      // dari `openStream` dengan pesan dan aksi yang tepat.
      if (!cameraError) void openStream(selectedId || undefined);
      return;
    }
    await report({
      preferred_device_id: selectedId || null,
      camera: {
        resolution: resLabel || undefined,
        width: resWidth,
      },
    });
    stopStream();
    if (videoRef.current) videoRef.current.srcObject = null;
    setStage("print");
  }

  async function confirmPrint(ok: boolean) {
    setPrintConfirmed(ok);
    await report({
      printer: { confirmed: ok, last_test_at: new Date().toISOString() },
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-7 overflow-y-auto bg-bg px-5 py-8 md:px-8 md:py-10">
      <header className="flex w-full max-w-[760px] flex-col items-start gap-2 border-b-2 border-ink/15 pb-5">
        <p className="font-mono text-[10px] font-bold uppercase leading-none tracking-[0.24em] text-muted-foreground">
          {`SETUP PERANGKAT · ${stage === "camera" ? "KAMERA" : "PRINTER"} · SEKALI SAJA`}
        </p>
        <h1 className="font-display text-3xl uppercase leading-[0.95] tracking-[-0.02em] md:text-4xl">
          {stage === "camera" ? "Siapkan kamera" : "Uji cetak"}
        </h1>
        {stage === "camera" && (
          <p className="max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
            {deviceCopy.hint}
          </p>
        )}
      </header>

      {stage === "camera" ? (
        <div className="flex w-full max-w-[760px] flex-col gap-5">
          {cameraProvider === "bridge" ? (
            <div className="flex flex-col gap-4 border-2 border-ink bg-surface p-5 shadow-hard md:p-6">
              <p className="max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
                Mode bridge memakai kamera fisik melalui runtime lokal. Pastikan adapter yang dipilih
                terpasang (gphoto2 / libcamera-still / ffmpeg / PyAV),
                kamera terhubung USB, dan `npm run bridge:local` sedang berjalan di komputer
                kiosk.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.08em]">
                Bridge: {cameraBridgeUrl(cameraSettings)}
              </p>
              <BridgeTokenField onSaved={() => void checkBridge()} />
              <Button
                size="lg"
                onClick={() => void testBridgeCapture()}
                className="w-fit bg-accent"
              >
                <Camera className="size-5" aria-hidden /> Uji capture kamera
              </Button>
              {cameraLive && !cameraCaptureTested && (
                <p role="status" className="font-mono text-xs font-bold uppercase">
                  Kamera terdeteksi · capture uji belum dilakukan
                </p>
              )}
              {cameraCaptureTested && (
                <p role="status" className="font-mono text-xs font-bold uppercase">
                  Kamera bridge siap · capture berhasil
                </p>
              )}
              {cameraError && (
                <p
                  role="alert"
                  className="border-2 border-destructive bg-destructive/10 p-3 text-sm"
                >
                  {cameraError.message}
                </p>
              )}
              <Button
                size="lg"
                onClick={() => void onCameraNext()}
                disabled={Boolean(cameraError) || !cameraCaptureTested}
                className="min-h-14 bg-accent-2"
              >
                {cameraCaptureTested ? "Lanjut ke uji cetak" : "Uji capture sebelum lanjut"}
              </Button>
            </div>
          ) : !supported ? (
            // Tanpa jalur keluar, wizard berhenti di sini selamanya dan welcome
            // tidak pernah muncul. Laporkan ke server untuk diagnostik, lalu
            // biarkan lanjut — error kamera yang sesungguhnya tampil di layar
            // capture dengan tombol ulang + ajakan panggil petugas.
            <div className="flex flex-col gap-4 border-2 border-ink bg-destructive/10 p-5 md:p-6">
              <p className="text-sm leading-relaxed">
                Browser tidak mendukung kamera. Gunakan Chrome terbaru di perangkat kiosk.
              </p>
              <Button
                variant="outline"
                className="w-fit"
                onClick={() => {
                  void report({ camera: { error: "UNSUPPORTED" } });
                  onDone();
                }}
              >
                Lanjut tanpa setup kamera
              </Button>
            </div>
          ) : (
            <>
              <div className="relative aspect-video w-full overflow-hidden border-2 border-ink bg-ink shadow-hard">
                {cameraError ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
                    <Camera className="size-8" aria-hidden />
                    <p className="max-w-[42ch] text-sm leading-relaxed">{cameraError.message}</p>
                    <Button
                      variant="outline"
                      onClick={() => void openStream(selectedId || undefined)}
                    >
                      {cameraError.action}
                    </Button>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              {devices.length > 1 && (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="camera-select"
                    className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                  >
                    Pilih kamera
                  </label>
                  <select
                    id="camera-select"
                    value={selectedId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedId(id);
                      void openStream(id);
                    }}
                    className="h-12 w-full rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Kamera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-2 border-ink/20 bg-surface px-4 py-3 text-xs">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                  Resolusi
                </span>
                <span className={`font-mono font-bold ${resWarning ? "text-destructive" : ""}`}>
                  {resLabel || "-"}
                </span>
                {resWarning && <span className="text-muted-foreground">· {resWarning}</span>}
              </div>

              <Button
                size="lg"
                onClick={() => void onCameraNext()}
                disabled={Boolean(cameraError) || !cameraLive}
                className="min-h-14 bg-accent-2"
              >
                {cameraLive ? "Lanjut ke uji cetak" : "Menyiapkan kamera..."}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="print-root flex w-full max-w-[560px] flex-col gap-5">
          {!profile.supportsPrint ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-start gap-4 border-2 border-ink bg-surface p-5 md:p-6">
                <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
                  Ponsel tidak mencetak langsung. Hasil dikirim sebagai QR ke halaman result online.
                  Cetak lewat perangkat booth bila tersedia.
                </p>
              </div>
              <Button size="lg" onClick={onDone} className="min-h-14 bg-accent">
                Selesai. Mulai
              </Button>
            </div>
          ) : (
            <>
              {resolvePrintMode(printSettings) === "cups" && (
                <div className="border-2 border-ink bg-surface p-5 shadow-hard md:p-6">
                  <BridgeTokenField />
                </div>
              )}
              <PrintTestPanel
                mode={resolvePrintMode(printSettings)}
                paperWidthMm={printSettings.bluetooth_paper_width_mm === 58 ? 58 : 80}
                sample={{ title: "UJI CETAK", lines: ["SETUP BOOTH", "SNAP YOS"] }}
                printSettings={printSettings}
                canReport={false}
                onReport={() => undefined}
              />

              <div className="flex flex-col gap-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                  Apakah test print berhasil?
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Button onClick={() => void confirmPrint(true)} className="bg-accent-3">
                    Ya, berhasil
                  </Button>
                  <Button variant="outline" onClick={() => void confirmPrint(false)}>
                    Tidak / ulangi
                  </Button>
                </div>
              </div>

              {printConfirmed ? (
                <Button size="lg" onClick={onDone} className="min-h-14 bg-accent">
                  Selesai. Mulai
                </Button>
              ) : (
                // Jalur keluar untuk booth tanpa printer berfungsi — tanpa ini
                // wizard tidak pernah selesai dan welcome tidak pernah muncul.
                <div className="flex flex-col gap-3 border-2 border-dashed border-ink/40 p-4">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Printer belum siap? Setup bisa dilewati. Uji cetak tetap bisa diulang kapan pun
                    dengan memasang ulang perangkat.
                  </p>
                  <Button
                    variant="outline"
                    className="w-fit"
                    onClick={() => {
                      // Tandai printer belum terkonfirmasi di server, lalu selesai.
                      void report({
                        printer: { confirmed: false, last_test_at: new Date().toISOString() },
                      });
                      onDone();
                    }}
                  >
                    Lewati uji cetak
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
