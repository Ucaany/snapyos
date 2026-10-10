"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CAMERA_ERRORS, cameraErrorKind, resolutionLabel, resolutionWarning } from "@/lib/camera-errors";
import { getDeviceProfile } from "@/lib/device-profile";
import { apiPost } from "@/components/kiosk/api";

type Props = {
  deviceToken: string;
  onDone: () => void;
};

type Stage = "camera" | "print";

/** Setup Wizard sekali — docs/05 §5.0.1 (permission kamera + detection + print test). */
export function SetupWizard({ deviceToken, onDone }: Props) {
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

  // print state
  const [printConfirmed, setPrintConfirmed] = useState(false);

  const profile = getDeviceProfile();

  // Copy dinamis per kelas perangkat — tablet kiosk tanpa sebut USB, phone
  // selfie mode, iPad instruksi "Add to Home Screen" (lihat device-profile).
  const deviceCopy = (() => {
    switch (profile.kind) {
      case "phone-android":
      case "phone-ios":
        return {
          hint: "Ponsel mode selfie — kamera depan dipakai otomatis. Pasang ponsel pada dudukan/stand.",
        };
      case "ipad":
        return {
          hint: "iPad — gunakan kamera belakang untuk kualitas terbaik. Pastikan sudah dipasang ke layar utama (Add to Home Screen).",
        };
      default:
        return {
          hint: "Tablet mode — kamera internal dipakai otomatis, tanpa kabel USB.",
        };
    }
  })();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  async function openStream(deviceId?: string) {
    const generation = ++streamGeneration.current;
    setCameraError(null);
    stopStream();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }
    try {
      const constraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } }
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
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      if (!deviceId && cams.length === 1) setSelectedId(cams[0]!.deviceId);
    } catch (e) {
      const kind = cameraErrorKind(e instanceof DOMException ? e.name : null);
      if (kind) {
        setCameraError({ message: CAMERA_ERRORS[kind].message, action: CAMERA_ERRORS[kind].action });
      } else {
        setCameraError({ message: "Gagal membuka kamera. Coba lagi.", action: "COBA LAGI" });
      }
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void openStream(), 0);
    return () => {
      clearTimeout(t);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCameraNext() {
    if (!supported || cameraError || !streamRef.current?.getVideoTracks().some((track) => track.readyState === "live")) {
      setCameraError({ message: "Kamera belum siap. Hubungkan kamera lalu coba lagi.", action: "COBA LAGI" });
      return;
    }
    try {
      await apiPost("/api/v1/public/devices/report", {
        device_token: deviceToken,
        preferred_device_id: selectedId || null,
        camera: {
          resolution: resLabel || undefined,
          width: resWidth,
        },
      });
    } catch {
      // gagal report tidak menggagalkan wizard — device tetap bisa lanjut
    }
    stopStream();
    if (videoRef.current) videoRef.current.srcObject = null;
    setStage("print");
  }

  async function confirmPrint(ok: boolean) {
    setPrintConfirmed(ok);
    try {
      await apiPost("/api/v1/public/devices/report", {
        device_token: deviceToken,
        printer: { confirmed: ok, last_test_at: new Date().toISOString() },
      });
    } catch {
      // gagal report tidak menggagalkan wizard
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center gap-8 bg-bg px-6 py-10">
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {`/// SETUP PERANGKAT: ${stage === "camera" ? "KAMERA" : "PRINTER"} (SEKALI SAJA)`}
        </p>
        <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-tight md:text-5xl">
          {stage === "camera" ? "Siapkan kamera" : "Uji cetak"}
        </h1>
        {stage === "camera" && (
          <p className="max-w-[52ch] font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
            {deviceCopy.hint}
          </p>
        )}
      </header>

      {stage === "camera" ? (
        <div className="flex w-full max-w-[760px] flex-col gap-6">
          {!supported ? (
            <div className="border-2 border-ink bg-destructive/10 p-6 font-mono text-sm">
              Browser tidak mendukung kamera. Gunakan Chrome terbaru di perangkat kiosk.
            </div>
          ) : (
            <>
              <div className="relative aspect-video w-full overflow-hidden border-2 border-ink bg-ink shadow-[4px_4px_0_0_#111111]">
                {cameraError ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
                    <Camera className="size-8" aria-hidden />
                    <p className="max-w-[42ch] font-mono text-sm">{cameraError.message}</p>
                    <Button variant="outline" onClick={() => void openStream(selectedId || undefined)}>
                      {cameraError.action}
                    </Button>
                  </div>
                ) : (
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                )}
              </div>

              {devices.length > 1 && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="camera-select" className="font-mono text-xs uppercase tracking-[0.1em]">
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
                    className="h-11 w-full rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Kamera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-2 border-ink bg-surface px-4 py-3 font-mono text-xs uppercase tracking-[0.08em]">
                <span className="font-bold">Resolusi:</span>
                <span className={resWarning ? "text-destructive" : "text-ink"}>{resLabel || "—"}</span>
                {resWarning && <span className="text-muted-foreground">· {resWarning}</span>}
              </div>

              <Button size="lg" onClick={() => void onCameraNext()} disabled={Boolean(cameraError)} className="bg-accent-2">
                Lanjut ke uji cetak
              </Button>
            </>
          )}
        </div>
      ) : (
          <div className="print-root flex w-full max-w-[560px] flex-col gap-6">
          {!profile.supportsPrint ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-start gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]">
                <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
                  Ponsel tidak mencetak langsung. Hasil dikirim sebagai QR ke halaman
                  result online. Cetak lewat perangkat booth bila tersedia.
                </p>
              </div>
              <Button size="lg" onClick={onDone} className="bg-accent">
                Selesai. Mulai
              </Button>
            </div>
          ) : (
            <>
          <div className="flex flex-col items-start gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]">
            <Printer className="size-8" aria-hidden />
            <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
              Printer foto default OS harus sudah terpasang di perangkat kiosk
              (ukuran kertas ikut setting owner: 4x6/A6). Cetak halaman uji,
              lalu konfirmasi hasil fisik. Di tablet Android/iPad dialog print
              sistem selalu muncul — pilih printer foto di dialog. Cetak senyap
              tanpa dialog hanya di Chrome desktop flag --kiosk-printing.
            </p>
            <Button variant="outline" onClick={() => window.print()}>
              Cetak halaman uji
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
              Apakah test print berhasil?
            </p>
            <div className="flex gap-3">
              <Button onClick={() => void confirmPrint(true)} className="bg-accent-3">
                Ya, berhasil
              </Button>
              <Button variant="outline" onClick={() => void confirmPrint(false)}>
                Tidak / ulangi
              </Button>
            </div>
          </div>

          {printConfirmed && (
            <Button size="lg" onClick={onDone} className="bg-accent">
              Selesai. Mulai
            </Button>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
