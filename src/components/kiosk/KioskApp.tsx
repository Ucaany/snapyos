"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Maximize2, Settings, WifiOff, X } from "lucide-react";
import type {
  CapturePhoto,
  FinalPhoto,
  KioskPageId,
  PublicConfig,
  PublicPackage,
  PublicTemplate,
} from "@/lib/kiosk-types";
import { kioskVisualStyle } from "@/lib/kiosk-types";
import { mergeAppearance } from "@/lib/appearance-merge";
import { availablePrintPaths } from "@/lib/print/print-mode";
import { printPlan } from "@/lib/print-layout";
import { resolveCaptureCount } from "@/lib/template-fit";
import { apiForm, apiPost, KioskError } from "@/components/kiosk/api";
import { mergeSettings, type DeviceSettings } from "@/lib/settings-merge";
import {
  abortLocalSession,
  createLocalSession,
  fetchDeviceSettings,
  fetchRuntimeStatus,
  finalizeLocalSession,
  saveDeviceSettings,
} from "@/components/kiosk/local-runtime";
import { listCupsPrinters } from "@/lib/print/cups";
import { canBootOffline, isNetworkFailure } from "@/components/kiosk/boot-offline";
import { useConfigSync } from "@/components/kiosk/use-config-sync";
import { useKioskLock, useHoldExit } from "@/components/kiosk/use-kiosk-lock";
import { ExitPinDialog } from "@/components/kiosk/ExitPinDialog";
import { BoothSettingsPanel } from "@/components/kiosk/BoothSettingsPanel";
import {
  buildFinalizeForm,
  drainQueue,
  enqueueFinalize,
  purgeLegacyDeviceTokenStore,
  purgeOrphaned,
} from "@/components/kiosk/offline-queue";
import { purgeOtherBusinesses, warmTemplateCache } from "@/components/kiosk/template-cache";
import { resolveGifProcessFrames } from "@/components/kiosk/photo-render";
import { ActivationScreen } from "@/components/kiosk/ActivationScreen";
import { SetupWizard } from "@/components/kiosk/SetupWizard";
import { WelcomeScreen } from "@/components/kiosk/WelcomeScreen";
import { GuideScreen } from "@/components/kiosk/GuideScreen";
import { PackagePicker } from "@/components/kiosk/PackagePicker";
import { CheckoutScreen } from "@/components/kiosk/CheckoutScreen";
import { TemplatePicker } from "@/components/kiosk/TemplatePicker";
import { SessionTimer } from "@/components/kiosk/SessionTimer";
import { ResultScreen } from "@/components/kiosk/ResultScreen";
import { ReviewScreen } from "@/components/kiosk/ReviewScreen";
import { KioskScreenRenderer } from "@/components/kiosk/KioskScreenRenderer";
import type { KioskScreenId } from "@/lib/kiosk-screen-registry";
import dynamic from "next/dynamic";

// Bundle split: layar berat (canvas capture/editor, print pipeline) dimuat saat
// step cocok — bukan di bundle awal kiosk. ssr:false (canvas/camera client-only).
const CameraCapture = dynamic(
  () => import("@/components/kiosk/CameraCapture").then((m) => m.CameraCapture),
  { ssr: false }
);
const Editor = dynamic(() => import("@/components/kiosk/Editor").then((m) => m.Editor), {
  ssr: false,
});
const PrintFlow = dynamic(() => import("@/components/kiosk/PrintFlow").then((m) => m.PrintFlow), {
  ssr: false,
});

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
  | "review"
  | "editor"
  | "printing"
  | "result";

type SessionInfo = { session_id: string; expires_at: string; result_token?: string | null };
type VerifyData = {
  photobox: PublicConfig["photobox"];
  /** Server menandai booth dalam mode terkunci — poll config live dijeda. */
  kiosk_locked?: boolean;
  active_session: {
    session_id: string;
    package_id: string;
    expires_at: string;
    result_token: string | null;
    /** Kuota foto paket asli (server) — anti-drift paket sintetis saat resume. */
    photo_count: number | null;
    /** Entitlement cetak paket asli — resume tidak boleh menghapus hak cetak. */
    print_count: number | null;
  } | null;
  /** Checkout paid yang sesinya belum dibuat (exit/reload pasca-bayar) — klaim, jangan bayar ulang. */
  claimable_checkout_id?: string | null;
};
type FinalizeResult = {
  result_token: string | null;
  gif_url: string | null;
  /** GIF slideshow semua capture mentah (tanpa frame). */
  photos_gif_url?: string | null;
  expires_at?: string | null;
};
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
  // kiosk_locked dari verify: berhenti polling saat booth dikunci.
  const [kioskLocked, setKioskLocked] = useState(false);
  const liveConfig = useConfigSync(
    config,
    businessSlug,
    config.photobox.slug,
    idle && !kioskLocked
  );
  // Setelan mesin dari runtime lokal. null = runtime tidak menjawab (kiosk
  // browser biasa atau runtime sedang restart). Itu normal: cloud dipakai.
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchDeviceSettings(config.photobox.camera_settings.bridge_url).then((value) => {
      if (alive) setDeviceSettings(value);
    });
    return () => {
      alive = false;
    };
  }, [config.photobox.camera_settings.bridge_url]);

  // Auto-connect printer: hanya mengisi `printer_name` yang KOSONG. Nilai yang
  // sudah diisi operator tidak pernah ditimpa, dan bridge mati tidak menyimpan apa pun.
  useEffect(() => {
    if (!deviceSettings) return;
    const print = (deviceSettings.print_settings ?? {}) as Record<string, unknown>;
    if (print.mode !== "cups") return;
    const existing = typeof print.printer_name === "string" ? print.printer_name.trim() : "";
    if (existing) return;
    let alive = true;
    void (async () => {
      const settings = {
        ...print,
        bridge_url: deviceSettings.camera_settings?.bridge_url,
      } as Parameters<typeof listCupsPrinters>[0];
      const result = await listCupsPrinters(settings);
      if (!alive || !result.ok) return;
      const preferred = result.printers.find((p) => p.default) ?? result.printers[0];
      if (!preferred) return;
      try {
        const saved = await saveDeviceSettings({
          print_settings: {
            ...print,
            mode: "cups",
            printer_name: preferred.name,
            photo: {
              ...(typeof print.photo === "object" && print.photo
                ? (print.photo as Record<string, unknown>)
                : {}),
              printer_name: preferred.name,
            },
          },
        });
        if (alive) setDeviceSettings(saved);
      } catch {
        // Best-effort: jangan blokir flow pelanggan karena setelan printer.
      }
    })();
    return () => {
      alive = false;
    };
  }, [deviceSettings]);
  // Derive (bukan sync-effect): idle = config live; sesi = snapshot state.
  // useMemo: mergeSettings mengembalikan objek baru, dan CameraCapture memo
  // akan re-render tiap KioskApp render tanpa identitas yang stabil.
  const currentPhotobox = useMemo(
    () => mergeSettings(idle ? liveConfig.photobox : photobox, deviceSettings),
    [idle, liveConfig.photobox, photobox, deviceSettings]
  );

  const [selectedPackage, setSelectedPackage] = useState<PublicPackage | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PublicTemplate | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [photos, setPhotos] = useState<CapturePhoto[]>([]);
  const [retakeCount, setRetakeCount] = useState(0);
  // Filter live dipilih di kamera dan menjadi nilai awal editor (per foto).
  const [filterId, setFilterId] = useState("original");
  // Mirror dipegang di induk agar ReviewScreen memakai state yang sama dengan
  // CameraCapture (preview & hasil capture identik). Nilai awal dari config.
  const [mirrorPreview, setMirrorPreview] = useState(
    currentPhotobox.camera_settings.mirror_preview !== false
  );
  // Sinkron live: config berubah (poll) → ikuti, tapi jangan reset toggle lokal
  // pengguna tiap render. Hanya nilai config yang BERUBAH yang memicu set.
  const configMirror = currentPhotobox.camera_settings.mirror_preview !== false;
  const lastConfigMirror = useRef(configMirror);
  useEffect(() => {
    if (lastConfigMirror.current !== configMirror) {
      lastConfigMirror.current = configMirror;
      setMirrorPreview(configMirror);
    }
  }, [configMirror]);
  const [finalPhotos, setFinalPhotos] = useState<FinalPhoto[]>([]);
  const [result, setResult] = useState<ResultState | null>(null);
  const [printed, setPrinted] = useState(false);
  // Auto-print saat finalize vs. cetak ulang yang diminta customer. Reprint
  // melewati guard auto-print: guard itu hanya mencegah cetak ganda otomatis,
  // bukan membungkam permintaan eksplisit dari layar hasil.
  const [reprintRequested, setReprintRequested] = useState(false);
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
  // Panel setelan booth: hanya terbuka SETELAH PIN petugas terverifikasi.
  // Tanpa gerbang ini siapa pun yang menyentuh layar bisa mengubah kamera,
  // printer, dan tampilan yang dilihat pelanggan.
  const [settingsPrompt, setSettingsPrompt] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const requestExit = useCallback(() => setExitPrompt(true), []);
  const { reengage, requestFullscreen, unlock, relock } = useKioskLock(
    // Kiosk dipaksa fullscreen di SEMUA layar, termasuk aktivasi, setup,
    // PIN petugas, dan panel setelan. Tidak ada opt-out dari setelan booth.
    true,
    currentPhotobox.camera_settings.screen_orientation,
    requestExit,
    true
  );
  const touchExit = useHoldExit(requestExit);

  /** PIN benar → keluar kiosk TANPA reload/reset — sesi & step tetap utuh. */
  function handleExitSuccess() {
    setExitPrompt(false);
    unlock();
  }

  /** Setelan booth tersimpan → pakai nilai baru tanpa menunggu reload. */
  function handleSettingsSaved(next: DeviceSettings) {
    setDeviceSettings(next);
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
          print_count: active.print_count ?? 0,
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
  async function handleCheckoutPaid(
    checkoutSessionId: string,
    tokenOverride?: string
  ): Promise<boolean> {
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
            setKioskLocked(data.kiosk_locked === true);
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
          .catch(async (e: unknown) => {
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
            // Jaringan mati: boot offline HANYA bila runtime lokal memastikan
            // dirinya booth ini. HTML yang sedang dirender datang dari cache SW
            // (satu kunjungan online sebelumnya), jadi config di props adalah
            // config terakhir yang sah.
            const status = isNetworkFailure(e)
              ? await fetchRuntimeStatus(config.photobox.camera_settings.bridge_url)
              : null;
            if (localStorage.getItem(TOKEN_KEY) !== token) return;
            // Setup yang belum pernah selesai = belum ada kunjungan online yang
            // sukses; wizard butuh cloud, jadi jangan pura-pura bisa jalan.
            if (
              localStorage.getItem(setupKey(config.photobox.slug)) &&
              canBootOffline(e, status, config.photobox.slug)
            ) {
              setDeviceToken(token);
              setPhotobox(config.photobox);
              setStep("welcome");
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

  // Purge DULU (slug lain), lalu warm slug aktif. Keduanya best-effort: gagal
  // cache tidak boleh menghentikan alur sesi.
  useEffect(() => {
    void purgeOtherBusinesses(businessSlug);
  }, [businessSlug]);

  // Warm saat booth menganggur + online saja: saat sesi berjalan bandwidth
  // dipakai untuk foto/print, bukan unduhan template.
  const mediaBusy = step === "capture" || step === "editor" || step === "printing";
  useEffect(() => {
    if (mediaBusy || !online) return;
    const ac = new AbortController();
    void warmTemplateCache(businessSlug, { signal: ac.signal });
    return () => ac.abort();
  }, [mediaBusy, online, businessSlug]);

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
   *
   * Jaringan mati → sesi dibuat runtime lokal (`local_*`). Itu satu-satunya
   * jalur yang membuat booth tetap menjual saat internet putus; sync worker
   * mengirim sesinya ke cloud begitu online.
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
      if (!isNetworkFailure(e)) {
        setNotice(e instanceof KioskError ? e.message : "Terjadi kesalahan. Coba lagi.");
        return;
      }
      try {
        const local = await createLocalSession({
          packageSnapshot: pkg,
          packageId: pkg.id,
          timerSeconds: sessionSettings?.timer_seconds ?? 0,
          bridgeUrl: config.photobox.camera_settings.bridge_url,
        });
        setSelectedPackage(pkg);
        setSession({ session_id: local.id, expires_at: local.expires_at, result_token: null });
        setStep("template");
      } catch (localError) {
        // Keduanya mati: cloud tidak terjangkau DAN runtime tidak menjawab.
        // Berhenti di sini — memulai sesi tanpa tempat menyimpan foto berarti
        // pelanggan membayar untuk hasil yang hilang.
        setNotice(
          localError instanceof KioskError
            ? `Cloud dan runtime lokal tidak terjangkau. ${localError.message}`
            : "Cloud dan runtime lokal tidak terjangkau."
        );
      }
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
      // Mode offline owner-enabled: layar checkout butuh `/checkout` (harga,
      // voucher, metode bayar) yang tidak bisa dihitung tanpa cloud. Saat
      // jaringan memang mati, langsung mulai sesi lokal dengan harga paket —
      // snapshot-nya membekukan harga, jadi sync tidak menagih harga baru.
      if (offlineEnabled && !navigator.onLine) {
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

  const handleCaptured = useCallback(
    (captured: CapturePhoto[], retakes: number) => {
      setPhotos(captured);
      setRetakeCount(retakes);
      // Feature flag per booth (default ON) — bisa dimatikan untuk rollback.
      setStep(currentPhotobox.session_settings.kiosk_review_grid === false ? "editor" : "review");
    },
    [currentPhotobox.session_settings.kiosk_review_grid]
  );

  const handleReviewContinue = useCallback((captured: CapturePhoto[], retakes: number) => {
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
  // Sakelar induk + grup `photo`/`thermal`: satu sumber kebenaran jalur cetak.
  const hasEnabledPrintPath = availablePrintPaths(currentPhotobox.print_settings).length > 0;

  const finalizeAndFinish = useCallback(
    async (final: FinalPhoto[]) => {
      if (!deviceToken || !session) return;
      setBusy(true);
      setNotice(null);

      // Ada minimal satu jalur cetak aktif? `enabled` datar + grup
      // `photo`/`thermal` ditegakkan `availablePrintPaths`; PrintFlow
      // mengulang pemeriksaan itu agar renderer tunggal pun aman.
      const shouldPrint = hasEnabledPrintPath && (selectedPackage?.print_count ?? 0) > 0;

      // GIF hanya relevan untuk template ber-slot: kolase progresif (slot terisi
      // satu per satu) dari capture mentah. Template legacy tanpa slot → kirim
      // set kosong; server/runtime jatuh ke `bodies` (foto final berframe) untuk
      // menghasilkan kedua GIF, jadi tidak ada render GIF sia-sia di kiosk.
      const hasSlots = Boolean(
        selectedTemplate?.layout && selectedTemplate.layout.slots.length > 0
      );
      const gifSource = hasSlots
        ? await resolveGifProcessFrames(
            photos.map((p) => p.blob),
            selectedTemplate!.layout,
            selectedTemplate!.file_url ?? null
          )
        : [];
      const allPhotosGifSource = hasSlots ? photos.map((p) => p.blob) : [];

      // Sesi `local_*` hanya dikenal runtime lokal. Cloud tidak punya barisnya,
      // jadi finalize HARUS ke runtime walau internet sudah hidup lagi — sync
      // worker yang mengirimkannya ke cloud nanti.
      if (session.session_id.startsWith("local_")) {
        try {
          const form = buildFinalizeForm({
            deviceToken,
            templateId: selectedTemplate?.id ?? null,
            retakeCount,
            photos: final.map((p) => p.blob),
            gifPhotos: gifSource,
            gifAllPhotos: allPhotosGifSource,
          });
          await finalizeLocalSession(
            session.session_id,
            form,
            config.photobox.camera_settings.bridge_url
          );
          setFinalPhotos(final);
          setResult({
            result_token: session.result_token ?? null,
            gif_url: null,
            pendingSync: true,
          });
          setReprintRequested(false);
          setStep(shouldPrint ? "printing" : "result");
        } catch (localError) {
          setNotice(
            localError instanceof KioskError
              ? localError.message
              : "Gagal menyimpan hasil di booth. Hubungi petugas."
          );
          setStep("editor");
        } finally {
          setBusy(false);
        }
        return;
      }

      // Offline: foto disimpan lokal, finalisasi disinkronkan saat online kembali.
      if (!navigator.onLine) {
        try {
          await enqueueFinalize({
            sessionId: session.session_id,
            businessSlug,
            templateId: selectedTemplate?.id ?? null,
            retakeCount,
            photos: final.map((p) => p.blob),
            // Capture mentah tanpa frame → GIF slideshow (bukan hasil komposit).
            gifPhotos: gifSource,
            gifAllPhotos: allPhotosGifSource,
            queuedAt: Date.now(),
          });
          setFinalPhotos(final);
          setResult({
            result_token: session.result_token ?? null,
            gif_url: null,
            pendingSync: true,
          });
          setReprintRequested(false);
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
          // Capture mentah tanpa frame → GIF slideshow (bukan hasil komposit).
          gifPhotos: gifSource,
          gifAllPhotos: allPhotosGifSource,
        });

        const data = await apiForm<FinalizeResult>(
          `/api/v1/public/${businessSlug}/sessions/${session.session_id}/finalize`,
          form
        );
        setFinalPhotos(final);
        setResult(data);
        setReprintRequested(false);
        setStep(shouldPrint ? "printing" : "result");
      } catch (e) {
        // Grace window lewat (offline terlalu lama) → terminal, bukan menunggu sync.
        if (e instanceof KioskError && e.code === "SESSION_EXPIRED") {
          setFinalPhotos(final);
          setResult({
            result_token: session.result_token ?? null,
            gif_url: null,
            syncFailed: true,
          });
          setReprintRequested(false);
          setStep(shouldPrint ? "printing" : "result");
        } else {
          setNotice(e instanceof KioskError ? e.message : "Gagal memfinalisasi sesi.");
          setStep("editor");
        }
      } finally {
        setBusy(false);
      }
    },
    [
      deviceToken,
      session,
      selectedTemplate,
      hasEnabledPrintPath,
      selectedPackage,
      businessSlug,
      retakeCount,
      photos,
      config.photobox.camera_settings.bridge_url,
    ]
  );

  const handleEditorFinish = useCallback(
    (final: FinalPhoto[]) => {
      void finalizeAndFinish(final);
    },
    [finalizeAndFinish]
  );
  /** Abort ke tempat sesi itu hidup: `local_*` di runtime, sisanya di cloud. */
  function abortSession(sessionId: string) {
    if (sessionId.startsWith("local_")) {
      void abortLocalSession(sessionId, config.photobox.camera_settings.bridge_url).catch(
        () => undefined
      );
      return;
    }
    void apiPost(`/api/v1/public/${businessSlug}/sessions/${sessionId}/abort`, {
      device_token: deviceToken,
    }).catch(() => undefined);
  }

  const handleTimerExpired = useCallback(() => {
    if (photos.length > 0) {
      setFinishRequested(true);
      setStep("editor");
    } else {
      // Tidak ada foto sama sekali → sesi tak bernilai: abort supaya booth
      // langsung bebas, bukan terkunci sampai grace offline (10 menit).
      if (session) abortSession(session.session_id);
      setSession(null);
      setSelectedPackage(null);
      setSelectedTemplate(null);
      setPhotos([]);
      setStep("welcome");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, session, businessSlug, deviceToken]);

  function handleReset() {
    // Buang sesi aktif yang belum difinalisasi — tanpa ini sesi zombie
    // mengunci booth ("Sesi lain masih berjalan") sampai grace offline habis.
    if (session && !result) abortSession(session.session_id);
    setSelectedPackage(null);
    setSelectedTemplate(null);
    setSession(null);
    setPhotos([]);
    setRetakeCount(0);
    setFinalPhotos([]);
    setResult(null);
    setPrinted(false);
    setReprintRequested(false);
    setFinishRequested(false);
    setNotice(null);
    setStep("welcome");
  }

  const plan = useMemo(() => {
    if (!selectedPackage) return null;
    // Template ber-slot menghasilkan satu composite penuh. Package hanya
    // menentukan berapa lembar composite tersebut dicetak.
    const hasLayout = Boolean(selectedTemplate?.layout);
    return printPlan(
      selectedPackage.print_count,
      hasLayout ? 1 : selectedPackage.photo_count,
      hasLayout ? "single" : selectedPackage.capture_mode,
      currentPhotobox.print_settings.layout
    );
  }, [selectedPackage, selectedTemplate, currentPhotobox.print_settings.layout]);

  // QR hasil di lembar cetak menunjuk ke halaman /r/[token] booth ini.
  // Dihitung dari origin saat render cetak (bukan saat init) agar pindah
  // domain/port kiosk tidak mencetak URL lama.
  const resultUrlForQr =
    typeof window !== "undefined" && result?.result_token
      ? `${window.location.origin}/r/${result.result_token}`
      : null;

  // Frame ber-slot adalah kontrak capture. Package tetap mengatur harga dan
  // print_count, tetapi tidak boleh memotong frame 6 slot menjadi 3 capture.
  // Template legacy tanpa layout tetap memakai photo_count package.
  const captureCount = resolveCaptureCount(
    selectedPackage?.photo_count ?? 1,
    selectedTemplate?.slot_count ?? 0
  );

  const sessionSettings = currentPhotobox.session_settings;
  // Branding efektif: identitas cloud (logo, warna brand, video) DASAR, lalu
  // kustomisasi booth (`appearance_settings` dari runtime lokal) di atasnya.
  // Booth menang karena hanya mesin di lokasi yang tahu layarnya — teks yang
  // muat di booth A belum tentu muat di booth B. Runtime mati → branding cloud
  // dipakai apa adanya (booth tetap jualan).
  const effectiveBranding = useMemo(
    () => mergeAppearance(liveConfig.branding, deviceSettings?.appearance_settings),
    [liveConfig.branding, deviceSettings?.appearance_settings]
  );
  // Gaya visual per layar — global kiosk + override per-layar (kioskVisualStyle).
  const kioskBranding = effectiveBranding.kiosk;
  // Warna brand (primary/secondary) — diteruskan ke tombol CTA tiap layar.
  const brandColors = {
    primary: effectiveBranding.primary_color,
    secondary: effectiveBranding.secondary_color,
  };
  const pageStyle = (page: KioskPageId) => kioskVisualStyle(kioskBranding, page, brandColors);
  const screenConfig = (screen: KioskScreenId) => ({
    screen,
    kiosk: kioskBranding,
    brand: brandColors,
    camera: currentPhotobox.camera_settings,
    orientation: currentPhotobox.camera_settings.screen_orientation,
  });
  // Panduan cara pakai (branding.kiosk.guide_steps) — kosong = dilewati.
  const guideSteps = kioskBranding?.guide_steps ?? [];
  const hasGuide = guideSteps.length > 0;

  // Booth maintenance: hentikan seluruh alur customer dan tampilkan layar
  // perawatan. Backend juga menolak sesi/checkout/payment baru (K-003).
  if (currentPhotobox.status === "maintenance") {
    return (
      <div
        data-kiosk-shell="true"
        className="flex h-[100dvh] flex-col overflow-hidden bg-bg text-ink"
      >
        <KioskScreenRenderer {...screenConfig("maintenance")} state="maintenance" />
      </div>
    );
  }

  return (
    <div
      // SATU sumbu scroll: shell setinggi viewport di semua ukuran, tiap layar
      // mengatur scroll internalnya. Dulu tinggi dikunci hanya di `lg`, jadi
      // tablet portrait 768–1023px jatuh ke layout mobile dan menciptakan
      // double scroll (shell + layar).
      data-kiosk-shell="true"
      className="flex h-[100dvh] flex-col overflow-hidden bg-bg text-ink"
      style={
        {
          // Safe-area is applied once by KioskScreenRenderer per customer screen.
          // The shell only owns the viewport and operator overlays.
        }
      }
    >
      {notice && (
        <div
          // In-flow (bukan fixed): banner fixed menutupi eyebrow/judul layar di
          // semua viewport. Strip ini menyusutkan tinggi layar, tidak menimpa.
          className="relative z-50 flex shrink-0 items-start justify-between gap-3 border-b-2 border-ink bg-accent px-4 py-3 shadow-hard-sm"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
          role="status"
          aria-live="polite"
        >
          <p className="text-xs font-bold uppercase leading-relaxed tracking-[0.03em]">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Tutup pesan"
            className="flex size-8 shrink-0 items-center justify-center border-2 border-ink bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
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
          <p className="text-[10px] font-bold uppercase leading-snug tracking-[0.08em]">
            {syncing
              ? "Sinkronisasi hasil offline..."
              : "Offline. Sesi tetap berjalan, hasil disinkronkan otomatis saat online."}
          </p>
        </div>
      )}

      {/* Timer ikut alur layout (bukan overlay fixed): sebelumnya badge fixed
          menutupi eyebrow/judul layar di kanan-atas. Strip ini menyusutkan
          tinggi layar sedikit, tetapi tidak pernah menutupi teks. */}
      {session && ["template", "capture", "review", "editor"].includes(step) && (
        <div className="relative z-40 flex shrink-0 justify-end px-3 pt-2">
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
          cameraSettings={currentPhotobox.camera_settings}
          printSettings={currentPhotobox.print_settings}
        />
      )}
      {step === "welcome" && (
        <KioskScreenRenderer {...screenConfig("welcome")}>
          <WelcomeScreen
            business={liveConfig.business}
            branding={effectiveBranding}
            elements={kioskBranding?.pages?.welcome?.elements}
            onStart={() => {
              // Gesture customer = kesempatan sah untuk fullscreen. Kunci ulang
              // di awal setiap sesi, termasuk setelah petugas keluar kiosk.
              relock();
              setStep(hasGuide ? "guide" : "package");
            }}
          />
        </KioskScreenRenderer>
      )}
      {step === "guide" && hasGuide && (
        <KioskScreenRenderer {...screenConfig("guide")}>
          <GuideScreen
            steps={guideSteps}
            kioskStyle={pageStyle("guide")}
            elements={kioskBranding?.pages?.guide?.elements}
            titleText={kioskBranding?.guide_title}
            buttonLabel={kioskBranding?.guide_button}
            videoUrl={kioskBranding?.pages?.guide?.video_url ?? null}
            onStart={() => setStep("package")}
            onBack={() => setStep("welcome")}
          />
        </KioskScreenRenderer>
      )}
      {step === "package" && (
        <KioskScreenRenderer {...screenConfig("package")}>
          <PackagePicker
            packages={liveConfig.packages}
            kioskStyle={pageStyle("package")}
            elements={kioskBranding?.pages?.package?.elements}
            titleText={kioskBranding?.package_title}
            primaryColor={effectiveBranding.primary_color}
            secondaryColor={effectiveBranding.secondary_color}
            videoUrl={kioskBranding?.pages?.package?.video_url ?? null}
            busy={busy}
            onBack={() => setStep(hasGuide ? "guide" : "welcome")}
            onSelect={(pkg) => void handlePackage(pkg)}
          />
        </KioskScreenRenderer>
      )}
      {step === "checkout" && selectedPackage && deviceToken && (
        <KioskScreenRenderer {...screenConfig("payment")}>
          <CheckoutScreen
            businessSlug={businessSlug}
            pkg={selectedPackage}
            deviceToken={deviceToken}
            offlineEnabled={offlineEnabled}
            paymentTitle={kioskBranding?.payment_title}
            paymentHint={kioskBranding?.payment_hint}
            kioskStyle={pageStyle("payment")}
            elements={kioskBranding?.pages?.payment?.elements}
            videoUrl={kioskBranding?.pages?.payment?.video_url ?? null}
            onOffline={() => void startDirectSession(selectedPackage)}
            onPaid={(checkoutId) => handleCheckoutPaid(checkoutId)}
            onBack={() => setStep("package")}
          />
        </KioskScreenRenderer>
      )}
      {step === "template" && selectedPackage && (
        <KioskScreenRenderer {...screenConfig("template")}>
          <TemplatePicker
            packagePhotoCount={selectedPackage.photo_count}
            packagePrintCount={selectedPackage.print_count}
            businessSlug={businessSlug}
            kioskStyle={pageStyle("template")}
            elements={kioskBranding?.pages?.template?.elements}
            titleText={kioskBranding?.template_title}
            videoUrl={kioskBranding?.pages?.template?.video_url ?? null}
            defaultTemplateId={currentPhotobox.default_template_id ?? null}
            onSelect={handleTemplate}
          />
        </KioskScreenRenderer>
      )}
      {step === "capture" && selectedPackage && (
        <KioskScreenRenderer {...screenConfig("capture")}>
          <CameraCapture
            cameraSettings={currentPhotobox.camera_settings}
            photoCount={captureCount}
            maxRetakes={sessionSettings?.max_retakes ?? null}
            titleText={kioskBranding?.capture_title}
            hintText={kioskBranding?.capture_hint}
            kioskStyle={pageStyle("capture")}
            elements={kioskBranding?.pages?.capture?.elements}
            showMirrorToggle={kioskBranding?.show_mirror_toggle !== false}
            onMirrorChange={setMirrorPreview}
            videoUrl={kioskBranding?.pages?.capture?.video_url ?? null}
            layout={selectedTemplate?.layout ?? null}
            frameUrl={selectedTemplate?.file_url ?? null}
            captureMode={selectedPackage.capture_mode}
            autoCapture={sessionSettings?.auto_capture === true}
            filterId={filterId}
            onFilterChange={setFilterId}
            onProgress={onProgressCapture}
            onComplete={handleCaptured}
          />
        </KioskScreenRenderer>
      )}
      {step === "review" && photos.length > 0 && (
        <KioskScreenRenderer {...screenConfig("review")}>
          <ReviewScreen
            photos={photos}
            photoCount={captureCount}
            maxRetakes={sessionSettings?.max_retakes ?? null}
            retakeCount={retakeCount}
            cameraSettings={currentPhotobox.camera_settings}
            kioskStyle={pageStyle("capture")}
            elements={kioskBranding?.pages?.capture?.elements}
            titleText={kioskBranding?.capture_title}
            filterId={filterId}
            mirrorPreview={mirrorPreview}
            onContinue={handleReviewContinue}
          />
        </KioskScreenRenderer>
      )}
      {step === "editor" && (
        <KioskScreenRenderer {...screenConfig("editor")}>
          <Editor
            photos={photos}
            finishing={busy}
            initialFilterId={filterId}
            onFinish={handleEditorFinish}
            layout={selectedTemplate?.layout ?? null}
            frameUrl={selectedTemplate?.file_url ?? null}
            titleText={kioskBranding?.editor_title}
            hintText={kioskBranding?.editor_hint}
            kioskStyle={pageStyle("edit")}
            elements={kioskBranding?.pages?.edit?.elements}
            videoUrl={kioskBranding?.pages?.edit?.video_url ?? null}
            allowZoomPan={kioskBranding?.allow_zoom_pan !== false}
            finishRequested={finishRequested}
          />
        </KioskScreenRenderer>
      )}
      {step === "printing" && plan && (
        <KioskScreenRenderer {...screenConfig("printing")}>
          <PrintFlow
            photos={finalPhotos}
            plan={plan}
            printSettings={currentPhotobox.print_settings}
            purpose="photo"
            resultUrl={resultUrlForQr}
            jobId={session?.session_id ?? result?.result_token ?? undefined}
            reprint={reprintRequested}
            framed={Boolean(selectedTemplate)}
            canvasAspect={
              selectedTemplate?.layout
                ? selectedTemplate.layout.canvas.width / selectedTemplate.layout.canvas.height
                : null
            }
            onDone={(success) => {
              setPrinted(success);
              setStep("result");
            }}
          />
        </KioskScreenRenderer>
      )}
      {step === "result" && result && (
        <KioskScreenRenderer {...screenConfig("result")}>
          <ResultScreen
            resultToken={result.result_token}
            gifUrl={result.gif_url ?? null}
            photosGifUrl={result.photos_gif_url ?? null}
            finalPhotos={finalPhotos}
            businessName={liveConfig.business.name}
            resultTitle={kioskBranding?.result_title}
            resultHint={kioskBranding?.result_hint}
            resultLayout={kioskBranding?.result_layout}
            kioskStyle={pageStyle("result")}
            elements={kioskBranding?.pages?.result?.elements}
            videoUrl={kioskBranding?.pages?.result?.video_url ?? null}
            printed={printed}
            canPrint={hasEnabledPrintPath && (selectedPackage?.print_count ?? 0) > 0}
            pendingSync={result.pendingSync === true}
            syncFailed={result.syncFailed === true}
            expiresAt={result.expires_at ?? null}
            onPrint={() => {
              setReprintRequested(true);
              setStep("printing");
            }}
            onReset={handleReset}
          />
        </KioskScreenRenderer>
      )}

      {/* Tombol petugas diskret: iPad/iOS tidak punya overlay re-engage
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
          // Kiri-bawah, di atas banner offline bila banner tampil. Sebelumnya
          // editor memindahkannya ke kanan-atas dan bertabrakan dengan header
          // foto + timer sesi; sudut kiri-bawah tidak dipakai kontrol mana pun.
          aria-describedby="kiosk-exit-help"
          className="fixed left-3 z-40 flex size-12 items-center justify-center border-2 border-ink/40 bg-surface text-ink transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:left-4"
          style={{
            marginLeft: "env(safe-area-inset-left)",
            bottom: online
              ? "calc(env(safe-area-inset-bottom) + 0.75rem)"
              : "calc(env(safe-area-inset-bottom) + 3.25rem)",
          }}
        >
          <Lock className="size-4" aria-hidden />
        </button>
      )}
      {/* Teks prosedur untuk pembaca layar; tidak terlihat (bukan teks visual). */}
      <p id="kiosk-exit-help" className="sr-only">
        Tahan tombol ini tiga detik lalu masukkan PIN keluar. Di keyboard, tahan Ctrl Alt X selama
        dua detik.
      </p>

      {/* Tombol setelan booth: diskret, di sebelah tombol keluar. Membuka panel
          setelan kamera/printer/sesi/tampilan SETELAH PIN petugas diverifikasi,
          tanpa melepas kiosk. Hanya tampil bila runtime lokal hidup — tanpa
          runtime tidak ada tempat menyimpan setelan mesin. */}
      {step !== "activation" && deviceSettings !== null && !exitPrompt && !settingsOpen && (
        <button
          type="button"
          aria-label="Petugas: buka setelan booth"
          title="Petugas: setelan booth"
          onClick={() => {
            requestFullscreen();
            setSettingsPrompt(true);
          }}
          className="fixed left-3 z-40 flex size-12 items-center justify-center border-2 border-ink/40 bg-surface text-ink transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:left-4"
          style={{
            marginLeft: "env(safe-area-inset-left)",
            bottom: online
              ? "calc(env(safe-area-inset-bottom) + 4rem)"
              : "calc(env(safe-area-inset-bottom) + 6.5rem)",
          }}
        >
          <Settings className="size-4" aria-hidden />
        </button>
      )}

      {/* Overlay re-engage fullscreen. Customer hanya bisa kembali ke mode
          penuh; keluar kiosk butuh PIN petugas (server-verified). */}
      {reengage && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 border-4 border-ink bg-bg p-6 text-center">
          <Maximize2 className="size-10" aria-hidden />
          <h2 className="font-display text-2xl uppercase leading-none tracking-[-0.02em] md:text-3xl">
            Kembali ke mode kiosk
          </h2>
          <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
            Layar penuh terlepas. Ketuk tombol di bawah untuk melanjutkan sesi.
          </p>
          <button
            type="button"
            onClick={() => requestFullscreen()}
            className="min-h-14 border-2 border-ink bg-accent px-6 py-3 font-display text-base font-bold uppercase tracking-[-0.01em] shadow-hard transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Kembali ke kiosk
          </button>
          <button
            type="button"
            onClick={() => setExitPrompt(true)}
            className="min-h-11 border-2 border-ink bg-surface px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground shadow-hard-sm transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Petugas: keluar kiosk
          </button>
        </div>
      )}

      {/* Dialog PIN keluar: keluar TIDAK me-reset sesi (tanpa reload). */}
      {exitPrompt && step !== "activation" && (
        <ExitPinDialog
          deviceToken={deviceToken}
          bridgeUrl={currentPhotobox.camera_settings.bridge_url}
          onSuccess={handleExitSuccess}
          onCancel={() => setExitPrompt(false)}
        />
      )}

      {/* Setelan booth: dibuka lewat PIN petugas, TIDAK melepas kiosk.
          Hanya tampil bila runtime lokal hidup — tanpa runtime tidak ada
          tempat menyimpan setelan mesin, dan panel hanya akan menampilkan
          tombol simpan yang pasti gagal. */}
      {settingsPrompt && step !== "activation" && (
        <ExitPinDialog
          deviceToken={deviceToken}
          bridgeUrl={currentPhotobox.camera_settings.bridge_url}
          purpose="settings"
          onSuccess={() => {
            setSettingsPrompt(false);
            setSettingsOpen(true);
          }}
          onCancel={() => setSettingsPrompt(false)}
        />
      )}
      {settingsOpen && step !== "activation" && (
        <BoothSettingsPanel
          initial={deviceSettings}
          bridgeUrl={currentPhotobox.camera_settings.bridge_url}
          photoboxName={currentPhotobox.name}
          onSaved={handleSettingsSaved}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
