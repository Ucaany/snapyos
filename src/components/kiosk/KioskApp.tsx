"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Maximize2, WifiOff, X } from "lucide-react";
import type { CapturePhoto, FinalPhoto, KioskPageId, PublicConfig, PublicPackage, PublicTemplate } from "@/lib/kiosk-types";
import { kioskVisualStyle } from "@/lib/kiosk-types";
import { printPlan } from "@/lib/print-layout";
import { apiForm, apiPost, KioskError } from "@/components/kiosk/api";
import { useConfigSync } from "@/components/kiosk/use-config-sync";
import { useKioskLock, useHoldExit } from "@/components/kiosk/use-kiosk-lock";
import { ExitPinDialog } from "@/components/kiosk/ExitPinDialog";
import {
  buildFinalizeForm,
  drainQueue,
  enqueueFinalize,
  purgeLegacyDeviceTokenStore,
  purgeOrphaned,
} from "@/components/kiosk/offline-queue";
import { prefetchTemplatesForPackages } from "@/components/kiosk/template-cache";
import { ActivationScreen } from "@/components/kiosk/ActivationScreen";
import { SetupWizard } from "@/components/kiosk/SetupWizard";
import { WelcomeScreen } from "@/components/kiosk/WelcomeScreen";
import { GuideScreen } from "@/components/kiosk/GuideScreen";
import { PackagePicker } from "@/components/kiosk/PackagePicker";
import { CheckoutScreen } from "@/components/kiosk/CheckoutScreen";
import { TemplatePicker } from "@/components/kiosk/TemplatePicker";
import { SessionTimer } from "@/components/kiosk/SessionTimer";
import { ResultScreen } from "@/components/kiosk/ResultScreen";
import dynamic from "next/dynamic";

// Bundle split: layar berat (canvas capture/editor, print pipeline) dimuat saat
// step cocok — bukan di bundle awal kiosk. ssr:false (canvas/camera client-only).
const CameraCapture = dynamic(
  () => import("@/components/kiosk/CameraCapture").then((m) => m.CameraCapture),
  { ssr: false }
);
const Editor = dynamic(
  () => import("@/components/kiosk/Editor").then((m) => m.Editor),
  { ssr: false }
);
const PrintLayoutRenderer = dynamic(
  () => import("@/components/kiosk/PrintLayoutRenderer").then((m) => m.PrintLayoutRenderer),
  { ssr: false }
);

const TOKEN_KEY = "snapyos_device_token";
// Flag setup disimpan PER PHOTOBOX — booth lain di browser yang sama tidak
// mewarisi status setup (re-aktivasi photobox baru wajib lewat wizard).
const SETUP_KEY_PREFIX = "snapyos_device_setup_done:";
const setupKey = (slug: string) => `${SETUP_KEY_PREFIX}${slug}`;

type Step =
  | "activation"
  | "setup"
  | "welcome"
  | "guide"
  | "package"
  | "checkout"
  | "template"
  | "capture"
  | "editor"
  | "printing"
  | "result";

type SessionInfo = { session_id: string; expires_at: string; result_token?: string | null };
type VerifyData = {
  photobox: PublicConfig["photobox"];
  active_session: {
    session_id: string;
    package_id: string;
    expires_at: string;
    result_token: string | null;
    /** Kuota foto paket asli (server) — anti-drift paket sintetis saat resume. */
    photo_count: number | null;
  } | null;
  /** Checkout paid yang sesinya belum dibuat (exit/reload pasca-bayar) — klaim, jangan bayar ulang. */
  claimable_checkout_id?: string | null;
};
type FinalizeResult = { result_token: string | null; gif_url: string | null };
/** pendingSync = menunggu sinkron antrian offline; syncFailed = terminal (grace habis). */
type ResultState = FinalizeResult & { pendingSync?: boolean; syncFailed?: boolean };

type Props = {
  config: PublicConfig;
  businessSlug: string;
  initialCode: string | null;
  /** Bypass dev (DEV_SKIP_PAYMENT): sesi langsung dari package tanpa QRIS. */
  devSkipPayment?: boolean;
  /** Mode offline owner-enabled (docs/05): tombol "tanpa QRIS" di checkout. */
  offlineEnabled?: boolean;
};

/** Kiosk state machine — docs/05 §5.1 (v2 pay-first: package → checkout → QRIS → sesi). */
export function KioskApp({
  config,
  businessSlug,
  initialCode,
  devSkipPayment = false,
  offlineEnabled = false,
}: Props) {
  const [step, setStep] = useState<Step>("activation");
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [photobox, setPhotobox] = useState(config.photobox);
  // Live config: poll ETag/304 3s saat idle — perubahan owner (timer, retake,
  // branding, paket) tersinkron tanpa reload; sesi berjalan tidak disentuh.
  const idle = step === "welcome" || step === "guide" || step === "package";
  const liveConfig = useConfigSync(config, businessSlug, config.photobox.slug, idle);
  // Derive (bukan sync-effect): idle = config live; sesi = snapshot state.
  const currentPhotobox = idle ? liveConfig.photobox : photobox;

  // Prefetch frame semua package saat idle — layar pilih frame pasca-bayar
  // instan (tanpa loading skeleton, gambar sudah warm di HTTP cache).
  const packageIds = useMemo(() => liveConfig.packages.map((p) => p.id), [liveConfig.packages]);
  useEffect(() => {
    if (!idle || packageIds.length === 0) return;
    prefetchTemplatesForPackages(businessSlug, packageIds);
  }, [idle, packageIds, businessSlug]);
  const [selectedPackage, setSelectedPackage] = useState<PublicPackage | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PublicTemplate | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [photos, setPhotos] = useState<CapturePhoto[]>([]);
  const [retakeCount, setRetakeCount] = useState(0);
  const [finalPhotos, setFinalPhotos] = useState<FinalPhoto[]>([]);
  const [result, setResult] = useState<ResultState | null>(null);
  const [printed, setPrinted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishRequested, setFinishRequested] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const paidHandledRef = useRef<string | null>(null);

  // Fullscreen kiosk lock — aktif dari setup sampai akhir flow (semua step
  // pasca-aktivasi). Keluar hanya via PIN petugas (server-verified, diatur
  // owner di dashboard); state sesi TIDAK di-reset saat keluar.
  const [exitPrompt, setExitPrompt] = useState(false);
  const requestExit = useCallback(() => setExitPrompt(true), []);
  const { reengage, requestFullscreen, unlock } = useKioskLock(
    step !== "activation",
    currentPhotobox.camera_settings.screen_orientation,
    requestExit
  );
  const touchExit = useHoldExit(requestExit);

  /** PIN benar → keluar kiosk TANPA reload/reset — sesi & step tetap utuh. */
  function handleExitSuccess() {
    setExitPrompt(false);
    unlock();
  }

  /** Resume sesi aktif dari verify — return true bila sesi dipulihkan. */
  const resumeFromVerify = useCallback(
    (token: string, data: VerifyData): boolean => {
      const active = data.active_session;
      if (!active) return false;
      setDeviceToken(token);
      setPhotobox(data.photobox);
      setSession(active);
      // Package bisa saja sudah dinonaktifkan pasca-pembayaran — sintetis dengan
      // nilai aman agar flow template/capture tetap jalan. `photo_count` diambil
      // dari paket asli (server, active_session.photo_count) agar capture tidak
      // melebihi kuota yang divalidasi server; fallback terakhir = 3.
      setSelectedPackage(
        config.packages.find((p) => p.id === active.package_id) ?? {
          id: active.package_id,
          name: "Paket kamu",
          price: 0,
          photo_count: active.photo_count ?? 3,
          print_count: 0,
          digital_output: true,
          capture_mode: "single" as const,
        }
      );
      setStep("template");
      return true;
    },
    [config.packages]
  );

  /** Cek server: bila ada sesi aktif → resume. Return true bila resumed. */
  const resumeActiveSession = useCallback(
    async (token: string): Promise<boolean> => {
      try {
        const data = await apiPost<VerifyData>("/api/v1/public/devices/verify", {
          device_token: token,
        });
        return resumeFromVerify(token, data);
      } catch {
        return false;
      }
    },
    [resumeFromVerify]
  );

  /**
   * Buka sesi dari checkout yang sudah paid. Mengembalikan false bila sesi
   * tidak terbuka — layar checkout memakainya untuk menawarkan tombol ulang,
   * bukan berputar selamanya di atas uang yang sudah dibayar customer.
   */
  async function handleCheckoutPaid(checkoutSessionId: string, tokenOverride?: string): Promise<boolean> {
    const token = tokenOverride ?? deviceToken;
    if (!token) return false;
    if (session) return true;
    if (paidHandledRef.current === checkoutSessionId) return false;
    paidHandledRef.current = checkoutSessionId;
    setBusy(true);
    setNotice(null);
    try {
      const data = await apiPost<SessionInfo>(`/api/v1/public/${businessSlug}/sessions`, {
        checkout_session_id: checkoutSessionId,
        device_token: token,
      });
      // Sesi sudah dibuat server — tarik konteks lengkap (package aktif) lewat
      // verify agar layar pilih frame punya `selectedPackage`; tanpa ini render
      // `step==="template" && selectedPackage` gagal → layar kosong pasca-bayar.
      if (await resumeActiveSession(token)) return true;
      setSession(data);
      setStep("template");
      return true;
    } catch (e) {
      paidHandledRef.current = null;
      if (await resumeActiveSession(token)) return true;
      setNotice(e instanceof KioskError ? e.message : "Gagal membuka sesi foto.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Boot: verifikasi device token tersimpan.
  // QR dengan ?code= = maksud pairing ulang eksplisit: buang token lama,
  // langsung ke layar aktivasi (auto-submit kode). Tanpa ini kiosk dengan
  // token aktif TIDAK PERNAH bisa di-pair ulang via QR.
  useEffect(() => {
    if (initialCode && initialCode.trim().length === 6) {
      localStorage.removeItem(TOKEN_KEY);
      void Promise.resolve().then(() => {
        setDeviceToken(null);
        setStep("activation");
      });
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    void (token
      ? apiPost<VerifyData>("/api/v1/public/devices/verify", {
          device_token: token,
        })
          .then((data) => {
            // Race guard: token di localStorage bisa sudah diganti aktivasi
            // baru saat verify lama masih in-flight — jangan timpa state.
            if (localStorage.getItem(TOKEN_KEY) !== token) return;
            setDeviceToken(token);
            setPhotobox(data.photobox);
            // Sesi aktif (mis. sudah dibayar lalu reload/back) → RESUME,
            // jangan paksa customer memilih paket & membayar lagi.
            if (resumeFromVerify(token, data)) return;
            // Dibayar tapi sesi belum sempat dibuat (keluar pasca-bayar) →
            // klaim checkout paid: sesi dibuka, TIDAK mengulang pembayaran.
            if (data.claimable_checkout_id) {
              void handleCheckoutPaid(data.claimable_checkout_id, token);
              return;
            }
            setStep(localStorage.getItem(setupKey(data.photobox.slug)) ? "welcome" : "setup");
          })
          .catch((e: unknown) => {
            // Race guard: hanya sentuh token bila token tersimpan masih token
            // lama yang gagal diverifikasi — bukan token baru dari aktivasi
            // yang berhasil di tengah verify in-flight.
            if (localStorage.getItem(TOKEN_KEY) !== token) return;
            // Hanya penolakan otentikasi yang membuang token. Error jaringan,
            // timeout, rate limit, atau 5xx TIDAK boleh memaksa pairing ulang:
            // booth yang wifi-nya sempat putus akan tampak seperti belum pernah
            // dipasang, dan petugas kehilangan sesi hanya karena gangguan sesaat.
            const rejected = e instanceof KioskError && e.code === "FORBIDDEN";
            if (rejected) {
              localStorage.removeItem(TOKEN_KEY);
              setDeviceToken(null);
              setStep("activation");
              return;
            }
            setNotice(
              e instanceof KioskError
                ? e.message
                : "Gagal memverifikasi perangkat. Periksa koneksi booth."
            );
            setStep("activation");
          })
      : Promise.resolve().then(() => setStep("activation")));
    // handleCheckoutPaid: fungsi stabil satu arah (set state + fetch) — tidak
    // perlu jadi dependency; effect cukup jalan sekali saat boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeFromVerify, initialCode]);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      // Token diambil dari live state (localStorage), BUKAN dari IndexedDB —
      // antrian tidak menyimpan bearer credential (lihat offline-queue.ts).
      const token = localStorage.getItem(TOKEN_KEY);
      const synced = await drainQueue(token);
      // Sapu item yatim HANYA setelah drain selesai (C4): tanpa token, item
      // yang gagal tersinkron memang tak akan pernah terkirim.
      await purgeOrphaned(token);
      if (synced > 0) {
        setNotice(`${synced} sesi offline berhasil disinkronkan.`);
        setResult((prev) => (prev?.pendingSync ? { ...prev, pendingSync: false } : prev));
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Online/offline + sinkron antrian finalize saat reconnect.
  useEffect(() => {
    // Defer agar setState tidak sinkron di body effect.
    const t = setTimeout(() => setOnline(navigator.onLine), 0);
    // Migrasi/keamanan: buang store lawas (sekali-jalan; flag-gated agar tidak
    // menghapus antrian live tiap boot). Sapu antrian yatim SETELAH drain, bukan
    // di sini, agar tidak balapan dengan retry 30s.
    purgeLegacyDeviceTokenStore();
    const up = () => {
      setOnline(true);
      void syncQueue();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    // Retry berkala: kegagalan transien saat online tidak menunggu event online baru.
    const retry = setInterval(() => void syncQueue(), 30_000);
    return () => {
      clearTimeout(t);
      clearInterval(retry);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [syncQueue]);

  function handleActivated(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
    setDeviceToken(token);
    setStep("setup");
    // Kode aktivasi sekali pakai sudah dikonsumsi (used_at). Buang ?code= dari
    // URL agar reload/restart kiosk tidak menganggap ini pairing ulang dan
    // auto-submit kode yang sudah hangus → tertahan di layar aktivasi.
    if (initialCode) {
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState(null, "", url);
    }
  }

  function handleSetupDone() {
    localStorage.setItem(setupKey(currentPhotobox.slug), "1");
    setStep("welcome");
  }

  /** Token ditolak server saat setup — buang token, kembali ke aktivasi. */
  function handleSetupAuthError() {
    localStorage.removeItem(TOKEN_KEY);
    setDeviceToken(null);
    setStep("activation");
  }

  /**
   * Sesi langsung dari package tanpa QRIS (dev bypass atau mode offline docs/05).
   * Server yang memutuskan: dev gate / offline_enabled — klien tidak dipercaya.
   */
  async function startDirectSession(pkg: PublicPackage) {
    if (!deviceToken || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = await apiPost<SessionInfo>(`/api/v1/public/${businessSlug}/sessions`, {
        package_id: pkg.id,
        device_token: deviceToken,
      });
      setSelectedPackage(pkg);
      setSession(data);
      setStep("template");
    } catch (e) {
      setNotice(e instanceof KioskError ? e.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePackage(pkg: PublicPackage) {
    // Sesi aktif tertinggal (back/reload pasca-bayar) → resume, bukan checkout baru.
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (deviceToken && (await resumeActiveSession(deviceToken))) return;
      if (devSkipPayment) {
        await startDirectSession(pkg);
        return;
      }
      setSelectedPackage(pkg);
      setStep("checkout");
    } finally {
      setBusy(false);
    }
  }

  // tokenOverride: boot path melewatkan token langsung karena setDeviceToken
  // belum commit saat .then() berjalan (React batching) — jangan baca state.
  const handleTemplate = useCallback((template: PublicTemplate | null) => {
    setSelectedTemplate(template);
    setStep("capture");
  }, []);

  const handleCaptured = useCallback((captured: CapturePhoto[], retakes: number) => {
    setPhotos(captured);
    setRetakeCount(retakes);
    setStep("editor");
  }, []);

  // Stabil agar CameraCapture (memo) tak re-render tiap KioskApp render
  // (progress capture menaikkan state photos/retake → tanpa ini anak ber-getar).
  const onProgressCapture = useCallback((captured: CapturePhoto[], retakes: number) => {
    setPhotos(captured);
    setRetakeCount(retakes);
  }, []);
  const finalizeAndFinish = useCallback(
    async (final: FinalPhoto[]) => {
      if (!deviceToken || !session) return;
      setBusy(true);
      setNotice(null);

      const shouldPrint =
        currentPhotobox.print_settings.enabled !== false && (selectedPackage?.print_count ?? 0) > 0;

      // Offline: foto disimpan lokal, finalisasi disinkronkan saat online kembali.
      if (!navigator.onLine) {
        try {
          await enqueueFinalize({
            sessionId: session.session_id,
            businessSlug,
            templateId: selectedTemplate?.id ?? null,
            retakeCount,
            photos: final.map((p) => p.blob),
            queuedAt: Date.now(),
          });
          setFinalPhotos(final);
          setResult({ result_token: session.result_token ?? null, gif_url: null, pendingSync: true });
          setStep(shouldPrint ? "printing" : "result");
        } catch {
          setNotice("Gagal menyimpan hasil offline. Hubungi petugas.");
        } finally {
          setBusy(false);
        }
        return;
      }

      try {
        const form = buildFinalizeForm({
          deviceToken,
          templateId: selectedTemplate?.id ?? null,
          retakeCount,
          photos: final.map((p) => p.blob),
        });

        const data = await apiForm<FinalizeResult>(
          `/api/v1/public/${businessSlug}/sessions/${session.session_id}/finalize`,
          form
        );
        setFinalPhotos(final);
        setResult(data);
        setStep(shouldPrint ? "printing" : "result");
      } catch (e) {
        // Grace window lewat (offline terlalu lama) → terminal, bukan menunggu sync.
        if (e instanceof KioskError && e.code === "SESSION_EXPIRED") {
          setFinalPhotos(final);
          setResult({ result_token: session.result_token ?? null, gif_url: null, syncFailed: true });
          setStep(shouldPrint ? "printing" : "result");
        } else {
          setNotice(e instanceof KioskError ? e.message : "Gagal memfinalisasi sesi.");
          setStep("editor");
        }
      } finally {
        setBusy(false);
      }
    },
    [deviceToken, session, selectedTemplate, currentPhotobox.print_settings.enabled, selectedPackage, businessSlug, retakeCount]
  );

  const handleEditorFinish = useCallback(
    (final: FinalPhoto[]) => {
      void finalizeAndFinish(final);
    },
    [finalizeAndFinish]
  );

  const handleTimerExpired = useCallback(() => {
    if (photos.length > 0) {
      setFinishRequested(true);
      setStep("editor");
    } else {
      // Tidak ada foto sama sekali → sesi tak bernilai: abort supaya booth
      // langsung bebas, bukan terkunci sampai grace offline (10 menit).
      if (session) {
        void apiPost(`/api/v1/public/${businessSlug}/sessions/${session.session_id}/abort`, {
          device_token: deviceToken,
        }).catch(() => undefined);
      }
      setSession(null);
      setSelectedPackage(null);
      setSelectedTemplate(null);
      setPhotos([]);
      setStep("welcome");
    }
  }, [photos, session, businessSlug, deviceToken]);

  function handleReset() {
    // Buang sesi aktif yang belum difinalisasi — tanpa ini sesi zombie
    // mengunci booth ("Sesi lain masih berjalan") sampai grace offline habis.
    if (session && !result) {
      void apiPost(`/api/v1/public/${businessSlug}/sessions/${session.session_id}/abort`, {
        device_token: deviceToken,
      }).catch(() => undefined);
    }
    setSelectedPackage(null);
    setSelectedTemplate(null);
    setSession(null);
    setPhotos([]);
    setRetakeCount(0);
    setFinalPhotos([]);
    setResult(null);
    setPrinted(false);
    setFinishRequested(false);
    setNotice(null);
    setStep("welcome");
  }

  const plan = useMemo(() => {
    if (!selectedPackage) return null;
    // Template ber-slot → hasil final = SATU composite (docs/15 §5.15):
    // tiap lembar cetak composite penuh, bukan foto terpisah.
    const hasLayout = Boolean(selectedTemplate?.layout);
    return printPlan(
      selectedPackage.print_count,
      hasLayout ? 1 : selectedPackage.photo_count,
      hasLayout ? "single" : selectedPackage.capture_mode,
      currentPhotobox.print_settings.layout
    );
  }, [selectedPackage, selectedTemplate, currentPhotobox.print_settings.layout]);

  // Jumlah capture = jumlah slot template (docs/15 §5.6); legacy = photo_count.
  const captureCount = (() => {
    const slotCount = selectedTemplate?.slot_count ?? 0;
    return slotCount > 0 ? slotCount : (selectedPackage?.photo_count ?? 1);
  })();

  const sessionSettings = currentPhotobox.session_settings;
  // Gaya visual per layar — global kiosk + override per-layar (kioskVisualStyle).
  const kioskBranding = liveConfig.branding.kiosk;
  // Warna brand (primary/secondary) — diteruskan ke tombol CTA tiap layar.
  const brandColors = {
    primary: liveConfig.branding.primary_color,
    secondary: liveConfig.branding.secondary_color,
  };
  const pageStyle = (page: KioskPageId) => kioskVisualStyle(kioskBranding, page, brandColors);
  // Panduan cara pakai (branding.kiosk.guide_steps) — kosong = dilewati.
  const guideSteps = kioskBranding?.guide_steps ?? [];
  const hasGuide = guideSteps.length > 0;

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-bg text-ink"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {notice && (
        <div
          className="fixed inset-x-0 top-0 z-50 flex items-start justify-between gap-3 border-b-2 border-ink bg-accent px-4 py-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.05em]">{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Tutup pesan">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {!online && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 border-t-2 border-ink bg-accent-2 px-4 py-2"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
            {syncing
              ? "Sinkronisasi hasil offline..."
               : "Offline. Sesi tetap berjalan, hasil disinkronkan otomatis saat online."}
          </p>
        </div>
      )}

      {session && ["template", "capture", "editor"].includes(step) && (
        <div className="fixed right-4 top-4 z-40">
          <SessionTimer
            expiresAt={session.expires_at}
            warningSeconds={sessionSettings?.warning_seconds ?? 60}
            onExpired={handleTimerExpired}
          />
        </div>
      )}

      {step === "activation" && (
        <ActivationScreen initialCode={initialCode} onActivated={handleActivated} />
      )}
      {step === "setup" && deviceToken && (
        <SetupWizard
          deviceToken={deviceToken}
          onDone={handleSetupDone}
          onAuthError={handleSetupAuthError}
        />
      )}
      {step === "welcome" && (
        <WelcomeScreen
          business={liveConfig.business}
          branding={liveConfig.branding}
          onStart={() => setStep(hasGuide ? "guide" : "package")}
        />
      )}
      {step === "guide" && hasGuide && (
        <GuideScreen
          steps={guideSteps}
          kioskStyle={pageStyle("guide")}
          titleText={kioskBranding?.guide_title}
          buttonLabel={kioskBranding?.guide_button}
          videoUrl={kioskBranding?.pages?.guide?.video_url ?? null}
          onStart={() => setStep("package")}
          onBack={() => setStep("welcome")}
        />
      )}
      {step === "package" && (
        <PackagePicker
          packages={liveConfig.packages}
          kioskStyle={pageStyle("package")}
          titleText={kioskBranding?.package_title}
          primaryColor={liveConfig.branding.primary_color}
          secondaryColor={liveConfig.branding.secondary_color}
          videoUrl={kioskBranding?.pages?.package?.video_url ?? null}
          busy={busy}
          onBack={() => setStep(hasGuide ? "guide" : "welcome")}
          onSelect={(pkg) => void handlePackage(pkg)}
        />
      )}
      {step === "checkout" && selectedPackage && deviceToken && (
        <CheckoutScreen
          businessSlug={businessSlug}
          pkg={selectedPackage}
          deviceToken={deviceToken}
          offlineEnabled={offlineEnabled}
          paymentTitle={liveConfig.branding.kiosk?.payment_title}
          paymentHint={liveConfig.branding.kiosk?.payment_hint}
          paymentAlign={liveConfig.branding.kiosk?.payment_align}
          kioskStyle={pageStyle("payment")}
          onOffline={() => void startDirectSession(selectedPackage)}
          onPaid={(checkoutId) => handleCheckoutPaid(checkoutId)}
          onBack={() => setStep("package")}
        />
      )}
      {step === "template" && selectedPackage && (
        <TemplatePicker
          packageId={selectedPackage.id}
          businessSlug={businessSlug}
          kioskStyle={pageStyle("template")}
          titleText={kioskBranding?.template_title}
          videoUrl={kioskBranding?.pages?.template?.video_url ?? null}
          onSelect={handleTemplate}
        />
      )}
      {step === "capture" && selectedPackage && (
        <CameraCapture
          cameraSettings={currentPhotobox.camera_settings}
          photoCount={captureCount}
          maxRetakes={sessionSettings?.max_retakes ?? null}
          titleText={liveConfig.branding.kiosk?.capture_title}
          hintText={liveConfig.branding.kiosk?.capture_hint}
          kioskStyle={pageStyle("capture")}
          showMirrorToggle={kioskBranding?.show_mirror_toggle !== false}
          videoUrl={kioskBranding?.pages?.capture?.video_url ?? null}
          layout={selectedTemplate?.layout ?? null}
          frameUrl={selectedTemplate?.file_url ?? null}
          onProgress={onProgressCapture}
          onComplete={handleCaptured}
        />
      )}
      {step === "editor" && (
        <Editor
          photos={photos}
          finishing={busy}
          onFinish={handleEditorFinish}
          layout={selectedTemplate?.layout ?? null}
          frameUrl={selectedTemplate?.file_url ?? null}
          titleText={liveConfig.branding.kiosk?.editor_title}
          hintText={liveConfig.branding.kiosk?.editor_hint}
          kioskStyle={pageStyle("edit")}
          allowZoomPan={kioskBranding?.allow_zoom_pan !== false}
          finishRequested={finishRequested}
        />
      )}
      {step === "printing" && plan && (
        <PrintLayoutRenderer
          photos={finalPhotos}
          plan={plan}
          printSettings={currentPhotobox.print_settings}
          onDone={(success) => {
            setPrinted(success);
            setStep("result");
          }}
        />
      )}
      {step === "result" && result && (
        <ResultScreen
          resultToken={result.result_token}
          gifUrl={result.gif_url ?? null}
          finalPhotos={finalPhotos}
          businessName={liveConfig.business.name}
          resultTitle={liveConfig.branding.kiosk?.result_title}
          resultHint={liveConfig.branding.kiosk?.result_hint}
          resultLayout={liveConfig.branding.kiosk?.result_layout}
          kioskStyle={pageStyle("result")}
          videoUrl={kioskBranding?.pages?.result?.video_url ?? null}
          printed={printed}
          canPrint={
            currentPhotobox.print_settings.enabled !== false &&
            (selectedPackage?.print_count ?? 0) > 0
          }
          pendingSync={result.pendingSync === true}
          syncFailed={result.syncFailed === true}
          onPrint={() => setStep("printing")}
          onReset={handleReset}
        />
      )}

      {/* Tombol petugas diskret — iPad/iOS tidak punya overlay re-engage
          (tanpa fullscreen), jadi PIN keluar butuh affordance tap-tahan yang
          selalu ada. Customer tidak terganggu (ikon kecil, low-opacity). */}
      {step !== "activation" && !exitPrompt && (
        <button
          type="button"
          aria-label="Petugas: tahan 3 detik untuk keluar kiosk"
          title="Petugas: tahan 3 detik"
          onPointerDown={touchExit.onPointerDown}
          onPointerUp={touchExit.onPointerUp}
          onPointerLeave={touchExit.onPointerLeave}
          onPointerCancel={touchExit.onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          // Editor: panel kontrol menutup sudut kiri-bawah, jadi tombol pindah
          // ke kanan-atas — tapi DI BAWAH SessionTimer (fixed right-4 top-4),
          // bukan menimpanya; kalau bertumpuk, hitungan waktu sesi tertutup.
          className={`fixed z-40 flex size-11 items-center justify-center border-2 border-ink/20 bg-surface/60 text-muted-foreground opacity-40 active:opacity-100 ${
            step === "editor" ? "right-3 top-16 lg:right-4 lg:top-16" : "bottom-3 left-3 lg:bottom-4 lg:left-4"
          }`}
          style={{
            marginBottom: "env(safe-area-inset-bottom)",
            marginLeft: "env(safe-area-inset-left)",
          }}
        >
          <Lock className="size-4" aria-hidden />
        </button>
      )}

      {/* Overlay re-engage fullscreen. Customer hanya bisa kembali ke mode
          penuh; keluar kiosk butuh PIN petugas (server-verified). */}
      {reengage && step !== "activation" && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 border-4 border-ink bg-bg p-6 text-center">
          <Maximize2 className="size-12" aria-hidden />
          <h2 className="font-display text-3xl uppercase leading-none tracking-tight">
            Mode kiosk terkunci
          </h2>
          <p className="max-w-[46ch] font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Layar kembali ke mode penuh untuk melanjutkan sesi.
          </p>
          <button
            type="button"
            onClick={() => requestFullscreen()}
            className="border-2 border-ink bg-accent px-6 py-3 font-display text-lg uppercase tracking-tight shadow-[4px_4px_0_0_#111111] transition-transform active:translate-y-[2px]"
          >
            Kembali ke kiosk
          </button>
          <button
            type="button"
            onClick={() => setExitPrompt(true)}
            className="border-2 border-ink bg-surface px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground shadow-[3px_3px_0_0_#111111] transition-transform active:translate-y-[2px]"
          >
            Petugas: keluar kiosk
          </button>
        </div>
      )}

      {/* Dialog PIN keluar — keluar TIDAK me-reset sesi (tanpa reload). */}
      {exitPrompt && step !== "activation" && (
        <ExitPinDialog
          deviceToken={deviceToken}
          onSuccess={handleExitSuccess}
          onCancel={() => setExitPrompt(false)}
        />
      )}
    </div>
  );
}
