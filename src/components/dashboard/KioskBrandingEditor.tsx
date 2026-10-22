"use client";

import Image from "next/image";
import { useActionState, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LABEL_CLASS as labelClass } from "@/lib/form-ui";
import type {
  BrandingConfig,
  KioskBrandingConfig,
  KioskFontFamily,
  KioskPageAlign,
  KioskPageConfig,
  KioskPageId,
} from "@/lib/kiosk-types";
import { kioskVisualStyle } from "@/lib/kiosk-types";
import { LOGO_MAX_BYTES, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS } from "@/lib/upload-validation";
import type { FormState } from "@/server/auth-actions";
import {
  deleteKioskPageVideoAction,
  deleteKioskVideoAction,
  deleteLogoAction,
  saveBrandingKioskAction,
  uploadKioskVideoAction,
  uploadKioskPageVideoAction,
  uploadLogoAction,
} from "@/server/branding-actions";
import { savePhotoboxBrandingAction } from "@/server/booth-actions";

const initial: FormState = {};

type PhotoboxOption = {
  id: string;
  name: string;
  slug: string;
  branding: BrandingConfig | null;
};

type Props = {
  businessName: string;
  branding: {
    welcome_title?: string;
    welcome_tagline?: string;
    welcome_button?: string;
    primary_color?: string;
    secondary_color?: string;
    logo_url: string | null;
    kiosk?: KioskBrandingConfig;
  } | null;
  photoboxes: PhotoboxOption[];
  canWrite: boolean;
};

const DEFAULTS = {
  primary: "#FFD400",
  secondary: "#111111",
  bgColor: "#FFFDF5",
  textColor: "#111111",
  fontScale: 1,
  radius: 0,
  padding: 24,
};

const fieldClass = "flex flex-col gap-2";
const cardClass = "border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]";

const PAGE_IDS: KioskPageId[] = [
  "welcome",
  "guide",
  "package",
  "payment",
  "template",
  "capture",
  "edit",
  "result",
];
const PAGE_LABELS: Record<KioskPageId, string> = {
  welcome: "Welcome",
  guide: "Tutorial",
  package: "Paket",
  payment: "Payment",
  template: "Frame",
  capture: "Foto",
  edit: "Edit",
  result: "Result",
};
const PAGE_OVERVIEW: Record<KioskPageId, string> = {
  welcome: "LAYAR UTAMA / BRANDING",
  guide: "PANDUAN SEBELUM BAYAR",
  package: "PEMILIHAN PAKET",
  payment: "PEMBAYARAN QRIS",
  template: "PEMILIHAN FRAME",
  capture: "MODUL FOTO / KAMERA",
  edit: "EDITOR FOTO",
  result: "HASIL / QR",
};

/** Bentuk state override per layar — string kosong warna/align = ikut global. */
type PageOverrideState = {
  active: boolean;
  bg_color: string;
  text_color: string;
  font_scale: number;
  button_radius: number;
  padding: number;
  align: KioskPageAlign | "";
};

const ALIGN_OPTIONS: { value: KioskPageAlign; label: string }[] = [
  { value: "left", label: "Rata kiri" },
  { value: "center", label: "Rata tengah" },
  { value: "right", label: "Rata kanan" },
];

const FONT_FAMILY_OPTIONS: { value: KioskFontFamily; label: string }[] = [
  { value: "display", label: "Display (tebal/brutalist)" },
  { value: "sans", label: "Sans (bersih/baca)" },
  { value: "mono", label: "Mono (teknis)" },
];

/** Mini-diagram per opsi: 3 bar dengan lebar & posisi bervariasi. */
const ALIGN_DIAGRAM: Record<KioskPageAlign, { justify: string; widths: string[] }> = {
  left: { justify: "justify-start", widths: ["w-full", "w-1/2", "w-3/4"] },
  center: { justify: "justify-center", widths: ["w-full", "w-3/4", "w-1/2"] },
  right: { justify: "justify-end", widths: ["w-full", "w-1/2", "w-3/4"] },
};

/**
 * AlignPicker — pemilih perataan konten (full element) dengan mini-diagram
 * 3 bar, jadi pemilik langsung paham efeknya tanpa membaca teks.
 * `allowNone`: klik opsi aktif lagi = kembali "" (ikut global) — untuk per-layar.
 */
function AlignPicker({
  value,
  onChange,
  disabled = false,
  allowNone = false,
  name,
}: {
  value: KioskPageAlign | "";
  onChange: (v: KioskPageAlign | "") => void;
  disabled?: boolean;
  allowNone?: boolean;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={`Perataan ${name}`} className="flex flex-wrap gap-2">
      {ALIGN_OPTIONS.map((o) => {
        const selected = value === o.value;
        const d = ALIGN_DIAGRAM[o.value];
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(selected && allowNone ? "" : o.value)}
            title={allowNone && selected ? `${o.label}: klik lagi untuk ikut global` : o.label}
            className={`flex w-[92px] flex-col gap-1.5 border-2 border-ink p-2 shadow-[2px_2px_0_0_#111111] transition-transform active:translate-y-[1px] disabled:opacity-40 ${
              selected ? "bg-accent" : "bg-surface hover:bg-muted"
            }`}
          >
            <span
              className="flex h-6 w-full flex-col justify-center gap-[3px] border border-ink/40 bg-bg p-1"
              aria-hidden
            >
              {d.widths.map((w, i) => (
                <span key={i} className={`flex ${d.justify}`}>
                  <span className={`h-[3px] bg-ink ${w}`} />
                </span>
              ))}
            </span>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-ink">
              {o.label}
              {allowNone && selected ? " ●" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const WELCOME_LAYOUT_OPTIONS = [
  { value: "split-left", label: "2 kolom (brand kiri)" },
  { value: "split-right", label: "2 kolom (brand kanan)" },
  { value: "center", label: "1 kolom (center)" },
] as const;

const RESULT_LAYOUT_OPTIONS = [
  { value: "qr-right", label: "QR kanan" },
  { value: "qr-left", label: "QR kiri" },
  { value: "qr-below", label: "QR bawah" },
] as const;

/**
 * Lapisan video latar di pratinjau layar. Dipakai semua tab yang punya slot
 * video sendiri (pages.<id>.video_url) supaya pratinjau menunjukkan apa yang
 * benar-benar dirender kiosk — bukan hanya di tab Welcome dan Tutorial.
 */
function PreviewVideo({ url }: { url?: string | null }) {
  if (!url) return null;
  return (
    <video
      key={url}
      src={url}
      muted
      loop
      playsInline
      autoPlay
      className="pointer-events-none absolute inset-0 size-full object-cover opacity-60"
      aria-hidden
    />
  );
}

const PREVIEW_SCREENS = [
  { id: "welcome", label: "Welcome" },
  { id: "guide", label: "Tutorial" },
  { id: "package", label: "Paket" },
  { id: "payment", label: "Payment" },
  { id: "template", label: "Frame" },
  { id: "capture", label: "Foto" },
  { id: "editor", label: "Edit" },
  { id: "result", label: "Result" },
] as const;

/**
 * KioskBrandingEditor — single source of truth kustomisasi kiosk:
 * teks, warna, tipografi, tombol, padding, visibilitas, video background.
 * Live preview kanan (sticky) mereplikasi welcome screen 2 kolom kiosk.
 */
export function KioskBrandingEditor({ businessName, branding, photoboxes, canWrite }: Props) {
  const k = branding?.kiosk ?? {};
  const [videoState, videoFormAction, videoPending] = useActionState(
    uploadKioskVideoAction,
    initial
  );
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    kind: "idle" | "saving" | "success" | "error";
    message?: string;
  }>({
    kind: "idle",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [title, setTitle] = useState(branding?.welcome_title ?? "");
  const [tagline, setTagline] = useState(branding?.welcome_tagline ?? "");
  const [button, setButton] = useState(branding?.welcome_button ?? "START");
  const [primary, setPrimary] = useState(branding?.primary_color ?? DEFAULTS.primary);
  const [secondary, setSecondary] = useState(branding?.secondary_color ?? DEFAULTS.secondary);
  const [bgColor, setBgColor] = useState(k.bg_color ?? DEFAULTS.bgColor);
  const [textColor, setTextColor] = useState(k.text_color ?? DEFAULTS.textColor);
  /** Font family judul/label kiosk (global semua layar). */
  const [fontFamily, setFontFamily] = useState<KioskFontFamily>(k.font_family ?? "display");
  /** Perataan konten global (semua layar) — menyerap legacy payment_align. */
  const [align, setAlign] = useState<KioskPageAlign | "">(k.align ?? k.payment_align ?? "center");
  const [fontScale, setFontScale] = useState(k.font_scale ?? DEFAULTS.fontScale);
  const [radius, setRadius] = useState(k.button_radius ?? DEFAULTS.radius);
  const [padding, setPadding] = useState(k.padding ?? DEFAULTS.padding);
  const [paymentTitle, setPaymentTitle] = useState(k.payment_title ?? "");
  const [paymentHint, setPaymentHint] = useState(k.payment_hint ?? "");
  const [captureTitle, setCaptureTitle] = useState(k.capture_title ?? "");
  const [captureHint, setCaptureHint] = useState(k.capture_hint ?? "");
  const [editorTitle, setEditorTitle] = useState(k.editor_title ?? "");
  const [editorHint, setEditorHint] = useState(k.editor_hint ?? "");
  const [resultTitle, setResultTitle] = useState(k.result_title ?? "");
  const [resultHint, setResultHint] = useState(k.result_hint ?? "");
  const [guideTitle, setGuideTitle] = useState(k.guide_title ?? "");
  const [guideButton, setGuideButton] = useState(k.guide_button ?? "");
  const [packageTitle, setPackageTitle] = useState(k.package_title ?? "");
  const [templateTitle, setTemplateTitle] = useState(k.template_title ?? "");
  const [welcomeLayout, setWelcomeLayout] = useState(k.welcome_layout ?? "split-left");
  const [resultLayout, setResultLayout] = useState(k.result_layout ?? "qr-right");
  const [showLogo, setShowLogo] = useState(k.show_logo !== false);
  const [showTagline, setShowTagline] = useState(k.show_tagline !== false);
  // Logo kiosk: baca langsung dari props (seperti video) agar preview ikut
  // ter-refresh setelah upload sukses, tanpa state yang bisa basi.
  const logoUrl = branding?.logo_url ?? null;
  const [logoPending, setLogoPending] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Tutorial / guide steps (custom, reorderable).
  const [guideSteps, setGuideSteps] = useState<string[]>(k.guide_steps ?? []);
  const [newStep, setNewStep] = useState("");
  // Tampilkan tombol mirror di layar kamera customer (default true).
  const [showMirrorToggle, setShowMirrorToggle] = useState(k.show_mirror_toggle !== false);
  // Izinkan customer zoom/pan foto di editor (default true).
  const [allowZoomPan, setAllowZoomPan] = useState(k.allow_zoom_pan !== false);
  // Per-booth override: booth dipilih + status override aktif/inherit.
  const [activeBoothId, setActiveBoothId] = useState<string | null>(null);
  const [boothUsesOverride, setBoothUsesOverride] = useState(false);
  const [boothStatus, setBoothStatus] = useState<{
    kind: "idle" | "saving" | "success" | "error";
    message?: string;
  }>({
    kind: "idle",
  });
  // Baca langsung dari props: setelah upload sukses + revalidate, prop video_url
  // terbaru langsung tampil (tanpa state — mencegah preview basi/stuck).
  const videoUrl = k.video_url ?? null;
  // Video promo per-layar (mis. layar kamera awal).
  const [pageVideoPage, setPageVideoPage] = useState<KioskPageId>("capture");
  const [pageVideoPending, setPageVideoPending] = useState(false);
  const [pageVideoError, setPageVideoError] = useState<string | null>(null);
  const [videoDeletePending, setVideoDeletePending] = useState(false);
  const [previewScreen, setPreviewScreen] =
    useState<(typeof PREVIEW_SCREENS)[number]["id"]>("welcome");
  const [activePage, setActivePage] = useState<KioskPageId>("welcome");

  /** Layar yang override tersimpannya harus dihapus saat Save berikutnya. */
  const [resetPages, setResetPages] = useState<KioskPageId[]>([]);
  const [pageOverrides, setPageOverrides] = useState<
    Partial<Record<KioskPageId, PageOverrideState>>
  >(() => {
    const savedPages = k.pages ?? {};
    const result: Record<string, PageOverrideState> = {};
    for (const id of PAGE_IDS) {
      const cfg = savedPages[id] as KioskPageConfig | undefined;
      if (cfg && Object.values(cfg).some((v) => v !== undefined)) {
        result[id] = {
          active: true,
          bg_color: cfg.bg_color ?? "",
          text_color: cfg.text_color ?? "",
          font_scale: cfg.font_scale ?? 1,
          button_radius: cfg.button_radius ?? 0,
          padding: cfg.padding ?? 24,
          align: cfg.align ?? "",
        };
      }
    }
    return result;
  });

  const saved = useRef({
    title: branding?.welcome_title ?? "",
    tagline: branding?.welcome_tagline ?? "",
    button: branding?.welcome_button ?? "START",
    primary: branding?.primary_color ?? DEFAULTS.primary,
    secondary: branding?.secondary_color ?? DEFAULTS.secondary,
    bgColor: k.bg_color ?? DEFAULTS.bgColor,
    textColor: k.text_color ?? DEFAULTS.textColor,
    fontFamily: k.font_family ?? "display",
    align: k.align ?? k.payment_align ?? "center",
    fontScale: k.font_scale ?? DEFAULTS.fontScale,
    radius: k.button_radius ?? DEFAULTS.radius,
    padding: k.padding ?? DEFAULTS.padding,
    pageOverrides: (() => {
      const savedPages = k.pages ?? {};
      const result: Record<string, PageOverrideState> = {};
      for (const id of PAGE_IDS) {
        const cfg = savedPages[id] as KioskPageConfig | undefined;
        if (cfg && Object.values(cfg).some((v) => v !== undefined)) {
          result[id] = {
            active: true,
            bg_color: cfg.bg_color ?? "",
            text_color: cfg.text_color ?? "",
            font_scale: cfg.font_scale ?? 1,
            button_radius: cfg.button_radius ?? 0,
            padding: cfg.padding ?? 24,
            align: cfg.align ?? "",
          };
        }
      }
      return result;
    })(),
    paymentTitle: k.payment_title ?? "",
    paymentHint: k.payment_hint ?? "",
    captureTitle: k.capture_title ?? "",
    captureHint: k.capture_hint ?? "",
    editorTitle: k.editor_title ?? "",
    editorHint: k.editor_hint ?? "",
    resultTitle: k.result_title ?? "",
    resultHint: k.result_hint ?? "",
    guideTitle: k.guide_title ?? "",
    guideButton: k.guide_button ?? "",
    packageTitle: k.package_title ?? "",
    templateTitle: k.template_title ?? "",
    welcomeLayout: k.welcome_layout ?? "split-left",
    resultLayout: k.result_layout ?? "qr-right",
    showLogo: k.show_logo !== false,
    showTagline: k.show_tagline !== false,
    guideSteps: k.guide_steps ?? [],
    showMirrorToggle: k.show_mirror_toggle !== false,
    allowZoomPan: k.allow_zoom_pan !== false,
  }).current;

  const videoInputRef = useRef<HTMLInputElement>(null);

  /** Set satu field override per layar; kosongkan warna/align = ikut global. */
  function setPageField(
    id: KioskPageId,
    field: keyof PageOverrideState,
    value: string | number | boolean
  ) {
    setPageOverrides((prev) => {
      const cur = prev[id] ?? {
        active: false,
        bg_color: "",
        text_color: "",
        font_scale: 1,
        button_radius: 0,
        padding: 24,
        align: "" as const,
      };
      return { ...prev, [id]: { ...cur, [field]: value } };
    });
  }

  /** Aktif/nonaktifkan override seluruh layar (nonaktif = bersihkan). */
  function togglePage(id: KioskPageId, active: boolean) {
    setPageOverrides((prev) => {
      const next = { ...prev };
      if (!active) {
        delete next[id];
      } else if (!next[id]) {
        next[id] = {
          active: true,
          bg_color: "",
          text_color: "",
          font_scale: 1,
          button_radius: 0,
          padding: 24,
          align: "" as const,
        };
      } else {
        next[id] = { ...next[id], active: true };
      }
      return next;
    });
    // Server melakukan deep-merge, jadi "tidak mengirim" saja tidak menghapus
    // apa pun. Catat layar ini agar save() meminta server membuang override-nya
    // (video_key tetap dipertahankan). Side effect sengaja di luar updater
    // state agar tidak berjalan dua kali di StrictMode.
    if (!active && k.pages?.[id]) {
      setResetPages((list) => (list.includes(id) ? list : [...list, id]));
    }
  }

  /** Konfigurasi `pages` untuk disimpan — hanya layar aktif dengan nilai non-empty.
   *  Warna hanya dikirim bila format hex valid (#RRGGBB) — teks bebas di input
   *  hex tidak boleh memicu reject zod server (fallback = ikut global). */
  function buildPagesConfig(): Partial<Record<KioskPageId, KioskPageConfig>> {
    const result: Partial<Record<KioskPageId, KioskPageConfig>> = {};
    for (const id of PAGE_IDS) {
      const p = pageOverrides[id];
      // video_key dikelola terpisah (upload/hapus) — selalu pertahankan nilai
      // tersimpan agar save() tidak menghapus video promo per-layar.
      const savedVideoKey = k.pages?.[id]?.video_key ?? null;
      const cfg: KioskPageConfig = {};
      if (savedVideoKey !== null) cfg.video_key = savedVideoKey;
      if (p?.active) {
        if (/^#[0-9a-fA-F]{6}$/.test(p.bg_color.trim())) cfg.bg_color = p.bg_color.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(p.text_color.trim())) cfg.text_color = p.text_color.trim();
        if (p.font_scale !== 1) cfg.font_scale = p.font_scale;
        if (p.button_radius !== 0) cfg.button_radius = p.button_radius;
        if (p.padding !== 24) cfg.padding = p.padding;
        if (p.align) cfg.align = p.align;
      }
      if (Object.keys(cfg).length > 0) result[id] = cfg;
    }
    return result;
  }

  /** Gaya live per layar untuk preview — global + override form saat ini. */
  function pageStyle(id: KioskPageId) {
    const liveKiosk: KioskBrandingConfig = {
      bg_color: bgColor,
      text_color: textColor,
      font_family: fontFamily,
      font_scale: fontScale,
      button_radius: radius,
      padding: padding,
      align: align || undefined,
      pages: buildPagesConfig(),
    };
    return kioskVisualStyle(liveKiosk, id, { primary, secondary });
  }

  function reset() {
    setTitle(saved.title);
    setTagline(saved.tagline);
    setButton(saved.button);
    setPrimary(saved.primary);
    setSecondary(saved.secondary);
    setBgColor(saved.bgColor);
    setTextColor(saved.textColor);
    setFontFamily(saved.fontFamily);
    setAlign(saved.align);
    setFontScale(saved.fontScale);
    setRadius(saved.radius);
    setPadding(saved.padding);
    setPaymentTitle(saved.paymentTitle);
    setPaymentHint(saved.paymentHint);
    setCaptureTitle(saved.captureTitle);
    setCaptureHint(saved.captureHint);
    setEditorTitle(saved.editorTitle);
    setEditorHint(saved.editorHint);
    setResultTitle(saved.resultTitle);
    setResultHint(saved.resultHint);
    setGuideTitle(saved.guideTitle);
    setGuideButton(saved.guideButton);
    setPackageTitle(saved.packageTitle);
    setTemplateTitle(saved.templateTitle);
    setWelcomeLayout(saved.welcomeLayout);
    setResultLayout(saved.resultLayout);
    setShowLogo(saved.showLogo);
    setShowTagline(saved.showTagline);
    setGuideSteps(saved.guideSteps);
    setShowMirrorToggle(saved.showMirrorToggle);
    setAllowZoomPan(saved.allowZoomPan);
    setPageOverrides(saved.pageOverrides);
    setResetPages([]);
    setStatus({ kind: "idle" });
    setFieldErrors({});
  }

  // --- Guide steps ---
  function addGuideStep() {
    const s = newStep.trim();
    if (!s || guideSteps.length >= 8) return;
    setGuideSteps((prev) => [...prev, s]);
    setNewStep("");
  }
  function removeGuideStep(index: number) {
    setGuideSteps((prev) => prev.filter((_, i) => i !== index));
  }
  function moveGuideStep(index: number, dir: -1 | 1) {
    setGuideSteps((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const a = next[index]!;
      next[index] = next[j]!;
      next[j] = a;
      return next;
    });
  }

  // --- Per-booth override ---
  function selectBooth(id: string | null) {
    setActiveBoothId(id);
    setBoothStatus({ kind: "idle" });
    if (id) {
      const booth = photoboxes.find((p) => p.id === id);
      setBoothUsesOverride(Boolean(booth?.branding));
    } else {
      setBoothUsesOverride(false);
    }
  }

  async function saveBoothOverride(useOverride: boolean) {
    if (!activeBoothId) return;
    setBoothStatus({ kind: "saving" });
    // Override booth memakai konfigurasi form global saat ini (full snapshot).
    // Reset ke inherit = kirim null (set kolom branding = null).
    const payload = useOverride
      ? {
          welcome_title: title.trim() || undefined,
          welcome_tagline: tagline.trim() || undefined,
          welcome_button: button.trim() || undefined,
          primary_color: primary,
          secondary_color: secondary,
          kiosk: {
            bg_color: bgColor,
            text_color: textColor,
            font_family: fontFamily,
            align: align || undefined,
            font_scale: fontScale,
            button_radius: radius,
            padding: padding,
            welcome_layout: welcomeLayout,
            result_layout: resultLayout,
            show_logo: showLogo,
            show_tagline: showTagline,
            show_mirror_toggle: showMirrorToggle,
            allow_zoom_pan: allowZoomPan,
            guide_steps: guideSteps.length > 0 ? guideSteps : undefined,
            pages: buildPagesConfig(),
          },
        }
      : null;
    // Action bisa MELEMPAR (mis. subscription expired) sebelum sempat
    // mengembalikan {ok:false}; tanpa catch, status "saving" menggantung
    // dan tombol terkunci selamanya tanpa pesan.
    try {
      const res = await savePhotoboxBrandingAction({
        photoboxId: activeBoothId,
        branding: payload as Record<string, unknown> | null,
      });
      if (res.ok) {
        setBoothUsesOverride(useOverride);
        setBoothStatus({
          kind: "success",
          message: useOverride
            ? "Booth memakai override tersimpan."
            : "Booth kembali mewarisi konfigurasi global.",
        });
      } else {
        setBoothStatus({ kind: "error", message: res.error ?? "Gagal menyimpan override booth." });
      }
    } catch {
      setBoothStatus({ kind: "error", message: "Gagal menyimpan override booth. Coba lagi." });
    }
  }

  /** Cek ukuran + durasi (metadata) sebelum upload. Dipakai video global dan
   *  per-layar: server hanya memvalidasi tipe + size, bukan durasi. */
  function probeVideo(file: File): Promise<string | null> {
    if (file.size > VIDEO_MAX_BYTES) return Promise.resolve("Ukuran video maksimal 15 MB.");
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (!Number.isFinite(probe.duration) || probe.duration <= 0) {
          resolve("Durasi video tidak terbaca. Coba file lain.");
        } else if (probe.duration > VIDEO_MAX_SECONDS + 0.05) {
          resolve(
            `Durasi video maksimal ${VIDEO_MAX_SECONDS} detik (terdeteksi ${probe.duration.toFixed(1)}s).`
          );
        } else {
          resolve(null);
        }
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("Video tidak terbaca. Gunakan MP4 atau WebM.");
      };
      probe.src = url;
    });
  }

  async function handleVideoChange(file: File | null) {
    if (!file) return;
    const problem = await probeVideo(file);
    if (problem) {
      setStatus({ kind: "error", message: problem });
      return;
    }
    setStatus({ kind: "idle" });
    videoInputRef.current?.form?.requestSubmit();
  }

  async function handleLogoChange(file: File | null) {
    if (!file) return;
    setLogoError(null);
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("Ukuran logo maksimal 2 MB.");
      return;
    }
    setLogoPending(true);
    try {
      const res = await uploadLogoAction({ logo: file });
      if (!res.ok) setLogoError(res.error ?? "Gagal mengunggah logo.");
    } catch {
      setLogoError("Gagal mengunggah logo. Coba lagi.");
    } finally {
      setLogoPending(false);
      // Reset input agar memilih file yang sama lagi tetap memicu onChange.
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleDeleteLogo() {
    if (!canWrite || logoPending) return;
    setLogoPending(true);
    setLogoError(null);
    try {
      const res = await deleteLogoAction();
      if (!res.ok) setLogoError(res.error ?? "Gagal menghapus logo.");
    } catch {
      setLogoError("Gagal menghapus logo. Coba lagi.");
    } finally {
      setLogoPending(false);
    }
  }

  async function handlePageVideoChange(file: File | null) {
    if (!file) return;
    setPageVideoError(null);
    const problem = await probeVideo(file);
    if (problem) {
      setPageVideoError(problem);
      return;
    }
    setPageVideoPending(true);
    try {
      const res = await uploadKioskPageVideoAction({
        page: pageVideoPage,
        video: file,
      });
      if (!res.ok) setPageVideoError(res.error ?? "Gagal mengunggah video per-layar.");
    } catch {
      setPageVideoError("Gagal mengunggah video per-layar. Coba lagi.");
    } finally {
      setPageVideoPending(false);
    }
  }

  async function handleDeleteVideo() {
    if (!canWrite || videoDeletePending) return;
    setVideoDeletePending(true);
    try {
      const res = await deleteKioskVideoAction();
      setStatus(
        res.ok
          ? { kind: "success", message: "Video background dihapus." }
          : { kind: "error", message: res.error ?? "Gagal menghapus video." }
      );
    } catch {
      setStatus({ kind: "error", message: "Gagal menghapus video. Coba lagi." });
    } finally {
      setVideoDeletePending(false);
    }
  }

  async function handleDeletePageVideo() {
    if (!canWrite || videoDeletePending) return;
    setVideoDeletePending(true);
    setPageVideoError(null);
    try {
      const res = await deleteKioskPageVideoAction(pageVideoPage);
      if (!res.ok) setPageVideoError(res.error ?? "Gagal menghapus video per-layar.");
    } catch {
      setPageVideoError("Gagal menghapus video per-layar. Coba lagi.");
    } finally {
      setVideoDeletePending(false);
    }
  }

  function save() {
    setStatus({ kind: "saving" });
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveBrandingKioskAction({
        welcome_title: title.trim() || undefined,
        welcome_tagline: tagline.trim() || undefined,
        welcome_button: button.trim() || undefined,
        primary_color: primary,
        secondary_color: secondary,
        kiosk: {
          bg_color: bgColor,
          text_color: textColor,
          font_family: fontFamily,
          align: align || undefined,
          font_scale: fontScale,
          button_radius: radius,
          padding: padding,
          welcome_layout: welcomeLayout,
          result_layout: resultLayout,
          payment_title: paymentTitle.trim() || undefined,
          payment_hint: paymentHint.trim() || undefined,
          capture_title: captureTitle.trim() || undefined,
          capture_hint: captureHint.trim() || undefined,
          editor_title: editorTitle.trim() || undefined,
          editor_hint: editorHint.trim() || undefined,
          result_title: resultTitle.trim() || undefined,
          result_hint: resultHint.trim() || undefined,
          guide_title: guideTitle.trim() || undefined,
          guide_button: guideButton.trim() || undefined,
          package_title: packageTitle.trim() || undefined,
          template_title: templateTitle.trim() || undefined,
          show_logo: showLogo,
          show_tagline: showTagline,
          show_mirror_toggle: showMirrorToggle,
          allow_zoom_pan: allowZoomPan,
          guide_steps: guideSteps.length > 0 ? guideSteps : undefined,
          pages: buildPagesConfig(),
        },
        // Level atas action, bukan di dalam `kiosk`: server membacanya sebagai
        // instruksi hapus, dan menyimpannya di jsonb akan lolos tanpa efek.
        reset_pages: resetPages,
      });
      if (result.ok) {
        setStatus({ kind: "success", message: "Tersimpan: kiosk memakai konfigurasi terbaru." });
        setResetPages([]);
        // Sinkronkan baseline Reset ke nilai yang baru saja disimpan (cegah
        // Reset mengembalikan nilai basi sebelum save).
        Object.assign(saved, {
          title: title.trim(),
          tagline: tagline.trim(),
          button: button.trim(),
          primary,
          secondary,
          bgColor,
          textColor,
          fontFamily,
          align,
          fontScale,
          radius,
          padding,
          paymentTitle,
          paymentHint,
          captureTitle,
          captureHint,
          editorTitle,
          editorHint,
          resultTitle,
          resultHint,
          guideTitle,
          guideButton,
          packageTitle,
          templateTitle,
          welcomeLayout,
          resultLayout,
          showLogo,
          showTagline,
          guideSteps,
          showMirrorToggle,
          allowZoomPan,
          pageOverrides,
        });
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        setStatus({
          kind: "error",
          message: result.error ?? "Gagal menyimpan. Periksa field bertanda merah.",
        });
      }
    });
  }

  const contrastSafe = (hex: string, fallback: string) =>
    /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
  const pSafe = contrastSafe(primary, DEFAULTS.primary);
  const sSafe = contrastSafe(secondary, DEFAULTS.secondary);
  const previewTitle = title || businessName;
  // Gaya preview per layar — global + override form saat ini (mencerminkan kiosk asli).
  const previewPageId: KioskPageId = previewScreen === "editor" ? "edit" : previewScreen;
  const ps = pageStyle(previewPageId);
  // Kelas perataan untuk preview — default tengah (sama dengan layar asli).
  const pvAlign = ps.align ?? "center";
  const pvAlignClass =
    pvAlign === "left"
      ? "items-start text-left"
      : pvAlign === "right"
        ? "items-end text-right"
        : "items-center text-center";
  const pvFont = ps.fontFamily;
  // Payment memakai align global (payment_align legacy sudah diserap di state align).
  const payAlignClass =
    align === "center" || align === ""
      ? "items-center text-center"
      : align === "right"
        ? "items-end text-right"
        : "items-start text-left";

  // Peta key editor → key fieldErrors dari Zod (brandingSchema + kioskBrandingSchema).
  // Editor memakai id pendek ("primary","secondary","bg","text"); Zod memakai
  // "primary_color","secondary_color" dan menaruh error kiosk (mis. kontras) di "kiosk".
  const ERROR_KEY_ALIASES: Record<string, string[]> = {
    primary: ["primary_color", "kiosk"],
    secondary: ["secondary_color", "kiosk"],
    bg: ["kiosk", "bg_color"],
    text: ["kiosk", "text_color"],
    font: ["kiosk"],
    radius: ["kiosk"],
    padding: ["kiosk"],
  };

  function err(key: string) {
    const keys = ERROR_KEY_ALIASES[key] ?? [key];
    for (const k of keys) {
      const msg = fieldErrors[k]?.[0] ?? videoState.fieldErrors?.[k]?.[0];
      if (msg) return msg;
    }
    return undefined;
  }

  // Validasi kontras live (R-25) — cegah owner menyimpan pasangan warna tak terbaca.
  const contrastRatio = (fg: string, bg: string): number | null => {
    if (!/^#[0-9a-fA-F]{6}$/.test(fg) || !/^#[0-9a-fA-F]{6}$/.test(bg)) return null;
    const lum = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const l1 = lum(fg);
    const l2 = lum(bg);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };
  const liveContrast = contrastRatio(textColor, bgColor);
  const contrastWarning =
    liveContrast !== null && liveContrast < 4.5
      ? `Kontras teks/background hanya ${liveContrast.toFixed(2)}:1, minimal 4.5:1 (WCAG AA).`
      : null;

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      <div className="flex flex-col gap-8 lg:col-span-7">
        <section className={cardClass} aria-labelledby="kb-welcome-heading">
          <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <h2 id="kb-welcome-heading" className="font-display text-lg uppercase tracking-tight">
              Teks &amp; Identitas: Welcome
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              01 / TEKS WELCOME
            </span>
          </div>
          <div className="flex flex-col gap-5">
            <div className={fieldClass}>
              <label htmlFor="kb-title" className={labelClass}>
                Judul
              </label>
              <Input
                id="kb-title"
                placeholder={businessName}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={120}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-tagline" className={labelClass}>
                Tagline
              </label>
              <Input
                id="kb-tagline"
                placeholder="Capture your moment."
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={200}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-button" className={labelClass}>
                Label tombol mulai
              </label>
              <Input
                id="kb-button"
                placeholder="START"
                value={button}
                onChange={(e) => setButton(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={24}
                aria-invalid={Boolean(err("welcome_button"))}
              />
              {err("welcome_button") && (
                <p role="alert" className="font-mono text-xs text-destructive">
                  {err("welcome_button")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em]">
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={(e) => setShowLogo(e.target.checked)}
                  disabled={pending || !canWrite}
                  className="size-4 accent-ink"
                />
                Tampilkan logo
              </label>
              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em]">
                <input
                  type="checkbox"
                  checked={showTagline}
                  onChange={(e) => setShowTagline(e.target.checked)}
                  disabled={pending || !canWrite}
                  className="size-4 accent-ink"
                />
                Tampilkan tagline
              </label>
            </div>
            <div className="flex flex-col gap-3 border-t-2 border-ink/20 pt-5">
              <label htmlFor="kb-logo" className={labelClass}>
                Logo kiosk
              </label>
              <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
                {"PNG, JPG, ATAU WEBP · MAKSIMAL 2 MB"}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={logoInputRef}
                  id="kb-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={logoPending || !canWrite}
                  onChange={(e) => void handleLogoChange(e.target.files?.[0] ?? null)}
                  className="border-2 border-ink bg-bg p-2 font-mono text-xs"
                />
                {logoUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDeleteLogo()}
                    disabled={logoPending || !canWrite}
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Hapus logo
                  </Button>
                )}
              </div>
              {logoPending && (
                <p role="status" className="font-mono text-xs">
                  Mengunggah…
                </p>
              )}
              {logoError && (
                <p role="alert" className="font-mono text-xs text-destructive">
                  {logoError}
                </p>
              )}
              {logoUrl && !logoPending && (
                <Image
                  src={logoUrl}
                  alt={`Logo ${businessName}`}
                  width={160}
                  height={48}
                  className="max-h-12 w-auto object-contain border-2 border-ink bg-bg p-2"
                  unoptimized
                />
              )}
            </div>
          </div>
        </section>

        <section className={cardClass} aria-labelledby="kb-color-heading">
          <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <h2 id="kb-color-heading" className="font-display text-lg uppercase tracking-tight">
              Gaya Global: Semua Layar
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              02 / GLOBAL
            </span>
          </div>
          <p className="mb-5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
            {"NILAI DASAR SELURUH LAYAR KIOSK · OVERRIDE PER-LAYAR ADA DI BAGIAN 03"}
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {(
              [
                ["kb-primary", "Utama: tombol/aksen", primary, setPrimary],
                ["kb-secondary", "Kedua: garis & teks", secondary, setSecondary],
                ["kb-bg", "Background kiosk", bgColor, setBgColor],
                ["kb-text", "Teks kiosk", textColor, setTextColor],
              ] as const
            ).map(([id, label, value, set]) => (
              <div key={id} className={fieldClass}>
                <label htmlFor={id} className={labelClass}>
                  {label}
                </label>
                <div className="flex items-stretch gap-2">
                  <input
                    type="color"
                    aria-label={`Pilih ${label}`}
                    value={contrastSafe(value, "#000000")}
                    onChange={(e) => set(e.target.value.toUpperCase())}
                    disabled={pending || !canWrite}
                    className="size-11 shrink-0 cursor-pointer rounded-none border-2 border-ink bg-surface p-1"
                  />
                  <Input
                    id={id}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    disabled={pending || !canWrite}
                    className="font-mono"
                    aria-invalid={Boolean(err(id.replace("kb-", "")))}
                  />
                </div>
                {err(id.replace("kb-", "")) && (
                  <p role="alert" className="font-mono text-xs text-destructive">
                    {err(id.replace("kb-", ""))}
                  </p>
                )}
              </div>
            ))}
          </div>
          {contrastWarning && (
            <p
              role="alert"
              className="mt-3 border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
            >
              {contrastWarning}
            </p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className={fieldClass}>
              <label htmlFor="kb-font-family" className={labelClass}>
                Font family
              </label>
              <select
                id="kb-font-family"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value as KioskFontFamily)}
                disabled={pending || !canWrite}
                className="border-2 border-ink bg-bg px-2 py-2 font-mono text-xs"
              >
                {FONT_FAMILY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {fontFamily === "mono" && (
                <p role="status" className="font-mono text-[10px] leading-relaxed text-destructive">
                  Mono sulit dibaca untuk instruksi customer. Pakai Display untuk judul dan biarkan
                  Mono untuk metadata.
                </p>
              )}
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-font" className={labelClass}>
                Skala font ({fontScale.toFixed(2)}x)
              </label>
              <input
                id="kb-font"
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                value={fontScale}
                onChange={(e) => setFontScale(Number(e.target.value))}
                disabled={pending || !canWrite}
                className="accent-ink"
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-radius" className={labelClass}>
                Radius tombol ({radius}px)
              </label>
              <input
                id="kb-radius"
                type="range"
                min={0}
                max={24}
                step={2}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                disabled={pending || !canWrite}
                className="accent-ink"
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-padding" className={labelClass}>
                Padding layar ({padding}px)
              </label>
              <input
                id="kb-padding"
                type="range"
                min={0}
                max={96}
                step={8}
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
                disabled={pending || !canWrite}
                className="accent-ink"
              />
            </div>
          </div>
          <div className={`mt-5 flex flex-col gap-2 border-t-2 border-ink/20 pt-5`}>
            <span className={labelClass}>Perataan konten (semua layar)</span>
            <AlignPicker
              value={align}
              onChange={(v) => setAlign(v || "center")}
              disabled={pending || !canWrite}
              name="konten global"
            />
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
              Mengatur posisi judul, teks, dan tombol (kiri, tengah penuh, atau kanan).
            </p>
          </div>
        </section>

        <section className={cardClass} aria-labelledby="kb-pages-heading">
          <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <h2 id="kb-pages-heading" className="font-display text-lg uppercase tracking-tight">
              Override Per-Layar
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              03 / OVERRIDE
            </span>
          </div>
          <p className="mb-5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
            {"PILIH LAYAR LALU TIMPA GAYA GLOBALNYA · WARNA, PERATAAN, SKALA FONT, RADIUS, PADDING"}
          </p>

          <div
            role="tablist"
            aria-label="Pilih layar untuk override"
            className="mb-5 flex flex-wrap gap-2"
          >
            {PAGE_IDS.map((id) => {
              const p = pageOverrides[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activePage === id}
                  onClick={() => setActivePage(id)}
                  disabled={pending || !canWrite}
                  className={`border-2 border-ink px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] shadow-[2px_2px_0_0_#111111] transition-transform active:translate-y-[1px] ${
                    activePage === id ? "bg-accent text-ink" : "bg-surface text-muted-foreground"
                  }`}
                >
                  {PAGE_LABELS[id]}
                  {p?.active ? " •" : ""}
                </button>
              );
            })}
          </div>

          {(() => {
            const id = activePage;
            const p = pageOverrides[id];
            const active = Boolean(p?.active);
            return (
              <div className="flex flex-col gap-4 border-2 border-ink/30 bg-bg p-4">
                <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em]">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => togglePage(id, e.target.checked)}
                    disabled={pending || !canWrite}
                    className="size-4 accent-ink"
                  />
                  Timpa nilai global untuk {PAGE_LABELS[id].toLowerCase()} ({PAGE_OVERVIEW[id]})
                </label>
                <div
                  className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${active ? "" : "pointer-events-none opacity-40"}`}
                >
                  <div className={fieldClass}>
                    <label className={labelClass}>Warna background (kosong = global)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={p?.bg_color || bgColor}
                        onChange={(e) => setPageField(id, "bg_color", e.target.value.toUpperCase())}
                        disabled={!active || pending || !canWrite}
                        aria-label={`Warna background ${PAGE_LABELS[id]}`}
                        className="size-11 shrink-0 cursor-pointer rounded-none border-2 border-ink bg-surface p-1"
                      />
                      <Input
                        value={p?.bg_color ?? ""}
                        onChange={(e) => setPageField(id, "bg_color", e.target.value.toUpperCase())}
                        placeholder={bgColor}
                        disabled={!active || pending || !canWrite}
                        aria-label={`Warna background ${PAGE_LABELS[id]} (hex)`}
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <div className={fieldClass}>
                    <label className={labelClass}>Warna teks (kosong = global)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={p?.text_color || textColor}
                        onChange={(e) =>
                          setPageField(id, "text_color", e.target.value.toUpperCase())
                        }
                        disabled={!active || pending || !canWrite}
                        aria-label={`Warna teks ${PAGE_LABELS[id]}`}
                        className="size-11 shrink-0 cursor-pointer rounded-none border-2 border-ink bg-surface p-1"
                      />
                      <Input
                        value={p?.text_color ?? ""}
                        onChange={(e) =>
                          setPageField(id, "text_color", e.target.value.toUpperCase())
                        }
                        placeholder={textColor}
                        disabled={!active || pending || !canWrite}
                        aria-label={`Warna teks ${PAGE_LABELS[id]} (hex)`}
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <div className={fieldClass}>
                    <label className={labelClass}>Skala font ({p?.font_scale ?? 1}x)</label>
                    <input
                      type="range"
                      min={0.8}
                      max={1.4}
                      step={0.05}
                      value={p?.font_scale ?? 1}
                      onChange={(e) => setPageField(id, "font_scale", Number(e.target.value))}
                      disabled={!active || pending || !canWrite}
                      aria-label={`Skala font ${PAGE_LABELS[id]}`}
                      className="accent-ink"
                    />
                  </div>
                  <div className={fieldClass}>
                    <label className={labelClass}>Radius tombol ({p?.button_radius ?? 0}px)</label>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={2}
                      value={p?.button_radius ?? 0}
                      onChange={(e) => setPageField(id, "button_radius", Number(e.target.value))}
                      disabled={!active || pending || !canWrite}
                      aria-label={`Radius tombol ${PAGE_LABELS[id]}`}
                      className="accent-ink"
                    />
                  </div>
                  <div className={fieldClass}>
                    <label className={labelClass}>Padding layar ({p?.padding ?? 24}px)</label>
                    <input
                      type="range"
                      min={0}
                      max={96}
                      step={8}
                      value={p?.padding ?? 24}
                      onChange={(e) => setPageField(id, "padding", Number(e.target.value))}
                      disabled={!active || pending || !canWrite}
                      aria-label={`Padding layar ${PAGE_LABELS[id]}`}
                      className="accent-ink"
                    />
                  </div>
                  <div className={fieldClass}>
                    <label className={labelClass}>Perataan konten (kosong = global)</label>
                    <AlignPicker
                      value={p?.align ?? ""}
                      onChange={(v) => setPageField(id, "align", v)}
                      disabled={!active || pending || !canWrite}
                      allowNone
                      name={PAGE_LABELS[id]}
                    />
                    {!p?.align && (
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        {`Ikut global: ${align || "tengah"}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => togglePage(id, false)}
                      disabled={!active || pending || !canWrite}
                    >
                      Reset layar ini
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>

        <section className={cardClass} aria-labelledby="kb-layout-heading">
          <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <h2 id="kb-layout-heading" className="font-display text-lg uppercase tracking-tight">
              Tata Letak Struktural
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              04 / LAYOUT
            </span>
          </div>
          <p className="mb-5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
            {"STRUKTUR KOLOM/PANEL · BERBEDA DARI PERATAAN KONTEN (BAGIAN 02 & 03)"}
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className={fieldClass}>
              <label htmlFor="kb-welcome-layout" className={labelClass}>
                Welcome: posisi kolom brand
              </label>
              <select
                id="kb-welcome-layout"
                value={welcomeLayout}
                onChange={(e) => setWelcomeLayout(e.target.value as typeof welcomeLayout)}
                disabled={pending || !canWrite}
                className="border-2 border-ink bg-bg px-2 py-2 font-mono text-xs"
              >
                {WELCOME_LAYOUT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-result-layout" className={labelClass}>
                Result: posisi panel QR
              </label>
              <select
                id="kb-result-layout"
                value={resultLayout}
                onChange={(e) => setResultLayout(e.target.value as typeof resultLayout)}
                disabled={pending || !canWrite}
                className="border-2 border-ink bg-bg px-2 py-2 font-mono text-xs"
              >
                {RESULT_LAYOUT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-4 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
            {
              "WELCOME = BRAND KIRI/KANAN/TENGAH · RESULT = QR KANAN/KIRI/BAWAH · PERATAAN LAINNYA LIHAT BAGIAN 02"
            }
          </p>
        </section>

        <section className={cardClass} aria-labelledby="kb-screens-heading">
          <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <h2 id="kb-screens-heading" className="font-display text-lg uppercase tracking-tight">
              Teks Layar Lain
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              05 / KONTEN
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className={fieldClass}>
              <label htmlFor="kb-pay-title" className={labelClass}>
                Judul payment (opsional)
              </label>
              <Input
                id="kb-pay-title"
                placeholder="Pembayaran"
                value={paymentTitle}
                onChange={(e) => setPaymentTitle(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={80}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-pay-hint" className={labelClass}>
                Hint payment (opsional)
              </label>
              <Input
                id="kb-pay-hint"
                placeholder="Scan QRIS untuk memulai sesi"
                value={paymentHint}
                onChange={(e) => setPaymentHint(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={160}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-res-title" className={labelClass}>
                Judul result (opsional)
              </label>
              <Input
                id="kb-res-title"
                placeholder="Selesai!"
                value={resultTitle}
                onChange={(e) => setResultTitle(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={80}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-res-hint" className={labelClass}>
                Hint result (opsional)
              </label>
              <Input
                id="kb-res-hint"
                placeholder="Scan QR untuk mengambil foto"
                value={resultHint}
                onChange={(e) => setResultHint(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={160}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-cap-title" className={labelClass}>
                Judul layar foto (opsional)
              </label>
              <Input
                id="kb-cap-title"
                placeholder="Foto 1 / 3"
                value={captureTitle}
                onChange={(e) => setCaptureTitle(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={80}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-cap-hint" className={labelClass}>
                Hint layar foto (opsional)
              </label>
              <Input
                id="kb-cap-hint"
                placeholder="Pose terbaikmu!"
                value={captureHint}
                onChange={(e) => setCaptureHint(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={160}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-ed-title" className={labelClass}>
                Judul layar edit (opsional)
              </label>
              <Input
                id="kb-ed-title"
                placeholder="Edit foto"
                value={editorTitle}
                onChange={(e) => setEditorTitle(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={80}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-ed-hint" className={labelClass}>
                Hint layar edit (opsional)
              </label>
              <Input
                id="kb-ed-hint"
                placeholder="Tambah filter, teks, stiker, lalu simpan"
                value={editorHint}
                onChange={(e) => setEditorHint(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={160}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-guide-title" className={labelClass}>
                Judul tutorial (opsional)
              </label>
              <Input
                id="kb-guide-title"
                placeholder="Cara foto"
                value={guideTitle}
                onChange={(e) => setGuideTitle(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={80}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-guide-button" className={labelClass}>
                Tombol mulai tutorial (opsional)
              </label>
              <Input
                id="kb-guide-button"
                placeholder="Mulai"
                value={guideButton}
                onChange={(e) => setGuideButton(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={24}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-package-title" className={labelClass}>
                Judul paket (opsional)
              </label>
              <Input
                id="kb-package-title"
                placeholder="Pilih paket kamu"
                value={packageTitle}
                onChange={(e) => setPackageTitle(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={80}
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="kb-template-title" className={labelClass}>
                Judul frame (opsional)
              </label>
              <Input
                id="kb-template-title"
                placeholder="Pilih frame"
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                disabled={pending || !canWrite}
                maxLength={80}
              />
              <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                Semua frame aktif tampil di semua paket. Slot yang lebih banyak dari jumlah foto
                paket diisi foto secara bergiliran.
              </p>
            </div>
          </div>
        </section>

        <section className={cardClass} aria-labelledby="kb-guide-heading">
          <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <h2 id="kb-guide-heading" className="font-display text-lg uppercase tracking-tight">
              Tutorial &amp; Kontrol Layar
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              06 / TUTORIAL
            </span>
          </div>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Langkah tutorial (custom + urut)</label>
              <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
                {"DITAMPILKAN SEBELUM PEMILIHAN PAKET · KOSONG = DILEWATI. MAX 8 LANGKAH."}
              </p>
              {guideSteps.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground">
                  Belum ada langkah. Tambahkan di bawah.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {guideSteps.map((step, i) => (
                    <li key={i} className="flex items-center gap-2 border-2 border-ink bg-bg p-2">
                      <span className="w-8 shrink-0 font-mono text-xs font-bold">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Input
                        value={step}
                        onChange={(e) =>
                          setGuideSteps((prev) =>
                            prev.map((s, j) => (j === i ? e.target.value : s))
                          )
                        }
                        disabled={pending || !canWrite}
                        maxLength={160}
                        className="h-9"
                      />
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => moveGuideStep(i, -1)}
                          disabled={pending || !canWrite || i === 0}
                          aria-label="Naikkan"
                          className="relative border-2 border-ink bg-surface p-1.5 after:absolute after:-inset-2 hover:bg-muted disabled:opacity-40"
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGuideStep(i, 1)}
                          disabled={pending || !canWrite || i === guideSteps.length - 1}
                          aria-label="Turunkan"
                          className="relative border-2 border-ink bg-surface p-1.5 after:absolute after:-inset-2 hover:bg-muted disabled:opacity-40"
                        >
                          <ArrowDown className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGuideStep(i)}
                          disabled={pending || !canWrite}
                          aria-label="Hapus langkah"
                          className="relative border-2 border-ink bg-surface p-1.5 text-destructive after:absolute after:-inset-2 hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex gap-2">
                <Input
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  placeholder="Tulis langkah tutorial…"
                  disabled={pending || !canWrite || guideSteps.length >= 8}
                  maxLength={160}
                  className="h-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addGuideStep();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addGuideStep}
                  disabled={pending || !canWrite || !newStep.trim() || guideSteps.length >= 8}
                >
                  <Plus className="size-4" aria-hidden /> Tambah
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 border-t-2 border-ink/20 pt-5">
              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em]">
                <input
                  type="checkbox"
                  checked={showMirrorToggle}
                  onChange={(e) => setShowMirrorToggle(e.target.checked)}
                  disabled={pending || !canWrite}
                  className="size-4 accent-ink"
                />
                Tampilkan tombol mirror di layar kamera
              </label>
              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em]">
                <input
                  type="checkbox"
                  checked={allowZoomPan}
                  onChange={(e) => setAllowZoomPan(e.target.checked)}
                  disabled={pending || !canWrite}
                  className="size-4 accent-ink"
                />
                Izinkan customer zoom/pan foto di editor
              </label>
            </div>
          </div>
        </section>

        <section className={cardClass} aria-labelledby="kb-booth-heading">
          <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <h2 id="kb-booth-heading" className="font-display text-lg uppercase tracking-tight">
              Override Per-Booth
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              07 / BOOTH
            </span>
          </div>
          <p className="mb-5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
            {
              "BOOTH MEWARISI KONFIGURASI GLOBAL; PILIH BOOTH UNTUK TIMPA SEBAGIAN/SELURUH TAMPILANNYA."
            }
          </p>
          <div className="flex flex-col gap-4">
            <div className={fieldClass}>
              <label htmlFor="kb-booth-select" className={labelClass}>
                Pilih booth
              </label>
              <select
                id="kb-booth-select"
                value={activeBoothId ?? ""}
                onChange={(e) => selectBooth(e.target.value || null)}
                disabled={!canWrite}
                className="border-2 border-ink bg-bg px-2 py-2 font-mono text-xs"
              >
                <option value="">(Semua booth, global)</option>
                {photoboxes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.branding ? " (override)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {activeBoothId && (
              <div className="flex flex-col gap-3 border-2 border-ink/30 bg-bg p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {boothUsesOverride
                    ? "BOOTH INI PUNYA OVERRIDE SENDIRI (TIMPA GLOBAL)."
                    : "BOOTH INI MEWARISI KONFIGURASI GLOBAL."}
                </p>
                <p className="font-mono text-xs leading-relaxed text-muted-foreground">
                  Override booth menyimpan snapshot konfigurasi form global saat ini. Setelah
                  disimpan, booth akan memakai nilai tersimpannya sendiri (tidak lagi ikut perubahan
                  global) sampai di-reset.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveBoothOverride(true)}
                    disabled={!canWrite || boothStatus.kind === "saving"}
                  >
                    <Save className="size-4" aria-hidden />{" "}
                    {boothStatus.kind === "saving" ? "Menyimpan…" : "Simpan override booth ini"}
                  </Button>
                  {boothUsesOverride && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void saveBoothOverride(false)}
                      disabled={!canWrite || boothStatus.kind === "saving"}
                    >
                      <RotateCcw className="size-4" aria-hidden /> Reset ke inherit global
                    </Button>
                  )}
                </div>
                {boothStatus.kind !== "idle" && boothStatus.message && (
                  <p
                    role={boothStatus.kind === "error" ? "alert" : "status"}
                    className={`border-2 px-3 py-2 font-mono text-xs ${boothStatus.kind === "error" ? "border-destructive bg-destructive/10 text-ink" : "border-ink bg-accent-2 text-ink"}`}
                  >
                    {boothStatus.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className={cardClass} aria-labelledby="kb-video-heading">
          <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <h2 id="kb-video-heading" className="font-display text-lg uppercase tracking-tight">
              Video Background
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              08 / VIDEO
            </span>
          </div>
          <form action={videoFormAction} className="flex flex-col gap-4">
            <p className="font-mono text-xs leading-relaxed text-muted-foreground">
              {
                "MP4/WebM, maksimal 5 detik, 15 MB. Looping (muted) di kiosk sebelum sesi foto dimulai."
              }
            </p>
            <input
              ref={videoInputRef}
              type="file"
              name="video"
              accept="video/mp4,video/webm"
              disabled={videoPending || !canWrite}
              onChange={(e) => void handleVideoChange(e.target.files?.[0] ?? null)}
              className="border-2 border-ink bg-bg p-2 font-mono text-xs"
            />
            {videoPending && (
              <p role="status" className="font-mono text-xs">
                Mengunggah…
              </p>
            )}
            {videoState.error && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {videoState.error}
              </p>
            )}
            {err("video") && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {err("video")}
              </p>
            )}
            {videoUrl && !videoPending && (
              <div className="flex flex-col gap-2">
                <video
                  src={videoUrl}
                  muted
                  loop
                  playsInline
                  autoPlay
                  className="max-h-40 w-auto border-2 border-ink bg-bg"
                  aria-label="Pratinjau video background kiosk"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {"VIDEO AKTIF · LOOPING DI WELCOME SCREEN"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDeleteVideo()}
                    disabled={videoDeletePending || !canWrite}
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Hapus video
                  </Button>
                </div>
              </div>
            )}
          </form>

          <div className="mt-5 flex flex-col gap-3 border-t-2 border-ink/20 pt-5">
            <label className={labelClass}>Video promo per-layar (mis. layar kamera awal)</label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pageVideoPage}
                onChange={(e) => setPageVideoPage(e.target.value as KioskPageId)}
                disabled={pageVideoPending || !canWrite}
                className="border-2 border-ink bg-bg px-2 py-2 font-mono text-xs"
                aria-label="Pilih layar untuk video promo"
              >
                {PAGE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {PAGE_LABELS[id]}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="video/mp4,video/webm"
                disabled={pageVideoPending || !canWrite}
                onChange={(e) => void handlePageVideoChange(e.target.files?.[0] ?? null)}
                className="border-2 border-ink bg-bg p-2 font-mono text-xs"
              />
            </div>
            {pageVideoPending && (
              <p role="status" className="font-mono text-xs">
                Mengunggah…
              </p>
            )}
            {pageVideoError && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {pageVideoError}
              </p>
            )}
            {k.pages?.[pageVideoPage]?.video_url && (
              <div className="flex flex-wrap items-center gap-3">
                <video
                  src={k.pages[pageVideoPage]?.video_url ?? undefined}
                  muted
                  loop
                  playsInline
                  className="max-h-32 w-auto border-2 border-ink bg-bg"
                  aria-label={`Pratinjau video layar ${PAGE_LABELS[pageVideoPage]}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDeletePageVideo()}
                  disabled={videoDeletePending || !canWrite}
                >
                  <Trash2 className="size-3.5" aria-hidden /> Hapus video layar ini
                </Button>
              </div>
            )}
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
              {
                "VIDEO LATAR DITAMPILKAN DI LAYAR YANG DIPILIH (WELCOME, TUTORIAL, PAKET, PAYMENT, FRAME, FOTO, EDIT, RESULT)."
              }
            </p>
          </div>
        </section>

        {status.kind !== "idle" && status.message && (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={`border-2 px-3 py-2 font-mono text-xs ${
              status.kind === "error"
                ? "border-destructive bg-destructive/10 text-ink"
                : status.kind === "success"
                  ? "border-ink bg-accent-2 text-ink"
                  : "border-ink/40 text-muted-foreground"
            }`}
          >
            {status.message}
          </p>
        )}

        {canWrite && (
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" size="lg" onClick={save} disabled={pending || videoPending}>
              <Save className="size-4" aria-hidden />
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={reset}
              disabled={pending || videoPending}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </Button>
          </div>
        )}
        {!canWrite && (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            READ-ONLY
          </p>
        )}
      </div>

      <aside className="lg:col-span-5 lg:sticky lg:top-[70px]" aria-label="Pratinjau kiosk">
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {"PREVIEW >>> KIOSK"}
          </p>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            LIVE
          </span>
        </div>
        <div role="tablist" aria-label="Pilih layar" className="mb-3 flex flex-wrap gap-2">
          {PREVIEW_SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={previewScreen === s.id}
              onClick={() => setPreviewScreen(s.id)}
              className={`border-2 border-ink px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] shadow-[2px_2px_0_0_#111111] transition-transform active:translate-y-[1px] ${
                previewScreen === s.id ? "bg-accent text-ink" : "bg-surface text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Frame bersama semua layar: border memakai secondary, bg/text memakai kiosk. */}
        <div
          className="aspect-[4/3] overflow-hidden border-4 shadow-[8px_8px_0_0_#111111]"
          style={{ borderColor: sSafe }}
        >
          {previewScreen === "welcome" && (
            <div
              className="relative flex size-full flex-col overflow-hidden"
              style={{ backgroundColor: ps.bg, color: ps.text, padding: ps.padding }}
            >
              {(k.pages?.welcome?.video_url ?? videoUrl) && (
                <video
                  key={k.pages?.welcome?.video_url ?? videoUrl ?? ""}
                  src={k.pages?.welcome?.video_url ?? videoUrl ?? undefined}
                  muted
                  loop
                  playsInline
                  autoPlay
                  className="absolute inset-0 size-full object-cover opacity-60"
                  aria-hidden
                />
              )}
              <div
                className={`relative z-10 grid flex-1 items-center gap-4 text-center ${
                  welcomeLayout === "center"
                    ? "grid-cols-1"
                    : welcomeLayout === "split-right"
                      ? "grid-cols-2 [&>*:first-child]:order-2"
                      : "grid-cols-2"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  {showLogo && branding?.logo_url ? (
                    <Image
                      src={branding.logo_url}
                      alt={`Logo ${businessName}`}
                      width={160}
                      height={48}
                      className="max-h-12 w-auto object-contain"
                      unoptimized
                    />
                  ) : null}
                  <p className="font-mono text-[8px] uppercase tracking-[0.3em] opacity-70">
                    {businessName.toUpperCase()}
                  </p>
                </div>
                <div className={`flex flex-col gap-2 ${pvAlignClass}`}>
                  <h2
                    className="font-display uppercase leading-none tracking-tight"
                    style={{
                      color: sSafe,
                      fontSize: `${1.75 * ps.fontScale}rem`,
                      fontFamily: pvFont,
                    }}
                  >
                    {previewTitle || "NAMA BISNIS"}
                  </h2>
                  {showTagline && (
                    <p
                      className="max-w-[20ch] leading-relaxed opacity-80"
                      style={{ fontSize: `${0.65 * ps.fontScale}rem` }}
                    >
                      {tagline || "Capture your moment."}
                    </p>
                  )}
                  <span
                    className="mt-2 inline-block border-2 px-6 py-2 font-mono font-bold uppercase tracking-[0.1em]"
                    style={{
                      backgroundColor: pSafe,
                      borderColor: sSafe,
                      color: sSafe,
                      borderRadius: ps.radius,
                      fontFamily: pvFont,
                    }}
                  >
                    {button || "START"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {previewScreen === "guide" && (
            <div
              className={`relative flex size-full flex-col justify-center gap-3 overflow-hidden ${pvAlignClass}`}
              style={{ backgroundColor: ps.bg, color: ps.text, padding: Math.min(ps.padding, 24) }}
            >
              {(k.pages?.guide?.video_url ?? null) && (
                <video
                  key={k.pages?.guide?.video_url ?? ""}
                  src={k.pages?.guide?.video_url ?? undefined}
                  muted
                  loop
                  playsInline
                  autoPlay
                  className="absolute inset-0 size-full object-cover opacity-50"
                  aria-hidden
                />
              )}
              <p className="relative z-10 font-mono text-[8px] uppercase tracking-[0.25em] opacity-60">
                {"PETUNJUK"}
              </p>
              <h2
                className="relative z-10 font-display uppercase leading-none tracking-tight"
                style={{ fontSize: `${1.4 * ps.fontScale}rem`, fontFamily: pvFont }}
              >
                {guideTitle || "Cara foto"}
              </h2>
              <ol className="relative z-10 flex flex-col gap-1.5">
                {(guideSteps.length > 0
                  ? guideSteps
                  : ["[LANGKAH 1]", "[LANGKAH 2]", "[LANGKAH 3]"]
                )
                  .slice(0, 3)
                  .map((step, i) => (
                    <li
                      key={`${i}-${step}`}
                      className="flex items-center gap-2 border-2 p-1.5 font-mono text-[8px] uppercase tracking-[0.05em]"
                      style={{ borderColor: ps.text, borderRadius: ps.radius }}
                    >
                      <span className="font-bold">{String(i + 1).padStart(2, "0")}</span>
                      <span className="truncate">{step}</span>
                    </li>
                  ))}
              </ol>
              <div
                className={`relative z-10 mt-1 flex gap-2 ${pvAlign === "center" ? "justify-center" : pvAlign === "right" ? "justify-end" : "justify-start"}`}
              >
                <span
                  className="border-2 px-3 py-1 font-mono text-[8px] font-bold uppercase"
                  style={{ borderColor: ps.text, borderRadius: ps.radius }}
                >
                  Kembali
                </span>
                <span
                  className="border-2 px-3 py-1 font-mono text-[8px] font-bold uppercase"
                  style={{
                    backgroundColor: pSafe,
                    borderColor: sSafe,
                    color: sSafe,
                    borderRadius: ps.radius,
                  }}
                >
                  {guideButton || "Mulai"}
                </span>
              </div>
            </div>
          )}

          {previewScreen === "package" && (
            <div
              className="relative flex size-full flex-col gap-2 overflow-hidden"
              style={{ backgroundColor: ps.bg, color: ps.text, padding: Math.min(ps.padding, 20) }}
            >
              <PreviewVideo url={k.pages?.package?.video_url} />
              <div className={`relative z-10 ${pvAlignClass}`}>
                <p className="font-mono text-[8px] uppercase tracking-[0.25em] opacity-60">
                  {"STEP 01 · PILIH PAKET"}
                </p>
                <h2
                  className="font-display uppercase leading-none tracking-tight"
                  style={{ fontSize: `${1.3 * ps.fontScale}rem`, fontFamily: pvFont }}
                >
                  {packageTitle || "Pilih paket"}
                </h2>
              </div>
              <div className="relative z-10 mt-auto grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-1 border-2 p-2"
                    style={{
                      borderColor: ps.text,
                      backgroundColor: i === 0 ? pSafe : "transparent",
                      borderRadius: ps.radius,
                    }}
                  >
                    <p
                      className="font-mono text-[7px] font-bold uppercase tracking-[0.1em]"
                      style={{ opacity: 0.7 }}
                    >{`PKG-${String(i + 1).padStart(2, "0")}`}</p>
                    <p
                      className="font-display text-[11px] uppercase leading-none"
                      style={{ fontFamily: pvFont }}
                    >{`[PAKET ${i + 1}]`}</p>
                    <p className="font-mono text-[9px] font-bold" style={{ color: sSafe }}>
                      Rp ...
                    </p>
                    <span
                      className="mt-auto border-2 px-2 py-1 text-center font-mono text-[7px] font-bold uppercase"
                      style={{
                        borderColor: ps.text,
                        backgroundColor: i === 0 ? ps.surface : pSafe,
                        borderRadius: ps.radius,
                      }}
                    >
                      Pilih
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewScreen === "payment" && (
            <div
              className={`relative flex size-full flex-col overflow-hidden ${payAlignClass}`}
              style={{ backgroundColor: ps.bg, color: ps.text, padding: Math.min(ps.padding, 24) }}
            >
              <PreviewVideo url={k.pages?.payment?.video_url} />
              <div className={`relative z-10 flex w-full flex-col gap-1 ${payAlignClass}`}>
                <p className="font-mono text-[8px] uppercase tracking-[0.3em] opacity-60">
                  {"CHECKOUT"}
                </p>
                <h2
                  className="font-display uppercase leading-none tracking-tight"
                  style={{ fontSize: `${1.25 * ps.fontScale}rem`, fontFamily: pvFont }}
                >
                  {paymentTitle || "Bayar sebelum foto"}
                </h2>
                {paymentHint && (
                  <p className="font-mono text-[8px] uppercase tracking-[0.1em] opacity-70">
                    {paymentHint}
                  </p>
                )}
              </div>
              <div className="relative z-10 mt-auto grid w-full grid-cols-2 gap-3">
                <div
                  className="flex flex-col gap-1 border-2 p-3"
                  style={{ borderColor: ps.text, borderRadius: ps.radius }}
                >
                  <p className="font-mono text-[7px] uppercase tracking-[0.1em] opacity-60">
                    [ RINGKASAN ]
                  </p>
                  <p
                    className="font-display text-[11px] uppercase leading-none"
                    style={{ fontFamily: pvFont }}
                  >
                    [PAKET]
                  </p>
                  <p className="font-mono text-[10px] font-bold" style={{ color: sSafe }}>
                    Rp ...
                  </p>
                </div>
                <div
                  className="flex flex-col items-center justify-center gap-2 border-2 p-3"
                  style={{ borderColor: ps.text, backgroundColor: pSafe, borderRadius: ps.radius }}
                >
                  <span
                    className="inline-block size-16 border-2"
                    style={{ borderColor: sSafe }}
                    aria-hidden
                  />
                  <p
                    className="font-mono text-[8px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: sSafe }}
                  >
                    QRIS
                  </p>
                </div>
              </div>
            </div>
          )}

          {previewScreen === "template" && (
            <div
              className="relative flex size-full overflow-hidden"
              style={{ backgroundColor: ps.bg, color: ps.text }}
            >
              <PreviewVideo url={k.pages?.template?.video_url} />
              <div
                className={`relative z-10 flex w-[38%] shrink-0 flex-col justify-center gap-1.5 border-r-2 p-3 ${pvAlignClass}`}
                style={{ borderColor: ps.text }}
              >
                <p className="font-mono text-[8px] uppercase tracking-[0.25em] opacity-60">
                  {"STEP 02 · FRAME"}
                </p>
                <h2
                  className="font-display uppercase leading-none tracking-tight"
                  style={{ fontSize: `${1.3 * ps.fontScale}rem`, fontFamily: pvFont }}
                >
                  {templateTitle || "Pilih frame"}
                </h2>
                <p
                  className="font-mono text-[7px] uppercase tracking-[0.1em]"
                  style={{ opacity: 0.6 }}
                >
                  [N] FRAME
                </p>
              </div>
              <div
                className="relative z-10 grid flex-1 grid-cols-3 gap-1.5 p-3"
                style={{ backgroundColor: `color-mix(in srgb, ${ps.text} 4%, ${ps.bg})` }}
              >
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex aspect-[3/4] items-center justify-center border-2 font-mono text-[7px] uppercase tracking-[0.1em]"
                    style={{
                      borderColor: ps.text,
                      borderRadius: ps.radius,
                      backgroundColor: i === 0 ? pSafe : ps.surface,
                    }}
                  >
                    {i === 0 ? "TANPA" : `FRAME ${i}`}
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewScreen === "capture" && (
            <div
              className="relative flex size-full overflow-hidden"
              style={{ backgroundColor: ps.bg, color: ps.text }}
            >
              <PreviewVideo url={k.pages?.capture?.video_url} />
              <div className="relative z-10 flex flex-1 items-center justify-center bg-ink">
                <span className="font-display text-4xl text-accent" aria-hidden>
                  FOTO 1/3
                </span>
              </div>
              <div
                className={`relative z-10 flex w-[34%] flex-col justify-center gap-2 border-l-2 p-4 ${pvAlignClass}`}
                style={{
                  borderColor: ps.text,
                  backgroundColor: ps.bg,
                  color: ps.text,
                  padding: Math.min(ps.padding, 32),
                }}
              >
                <p
                  className="font-mono text-[8px] uppercase tracking-[0.25em]"
                  style={{ opacity: 0.6 }}
                >
                  {"CAPTURE"}
                </p>
                <p
                  className="font-display text-base uppercase"
                  style={{ fontSize: `${1 * ps.fontScale}rem`, fontFamily: pvFont }}
                >
                  {captureTitle || "Foto 1 / 3"}
                </p>
                {captureHint && (
                  <p
                    className="font-mono text-[7px] uppercase tracking-[0.15em]"
                    style={{ opacity: 0.5 }}
                  >
                    {captureHint}
                  </p>
                )}
                <span
                  className="mt-2 border-2 px-4 py-2 font-mono text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: pSafe,
                    borderColor: ps.text,
                    color: sSafe,
                    borderRadius: ps.radius,
                    fontFamily: pvFont,
                  }}
                >
                  Ambil foto
                </span>
              </div>
            </div>
          )}

          {previewScreen === "editor" && (
            <div
              className="relative flex size-full flex-col overflow-hidden"
              style={{ backgroundColor: ps.bg, color: ps.text }}
            >
              <PreviewVideo url={k.pages?.edit?.video_url} />
              <div
                className={`relative z-10 flex items-center gap-3 border-b-2 px-4 py-2 ${pvAlign === "left" ? "justify-start" : pvAlign === "right" ? "justify-end" : "flex-col justify-center"}`}
                style={{
                  borderColor: ps.text,
                  backgroundColor: `color-mix(in srgb, ${ps.text} 8%, ${ps.bg})`,
                }}
              >
                <div className={`flex flex-col ${pvAlignClass}`}>
                  <p className="font-mono text-[8px] uppercase tracking-[0.2em] opacity-60">
                    {"EDIT"}
                  </p>
                  <h2
                    className="font-display uppercase leading-none tracking-tight"
                    style={{ fontSize: `${1 * ps.fontScale}rem`, fontFamily: pvFont }}
                  >
                    {editorTitle || "Edit foto"}
                  </h2>
                  {editorHint && (
                    <p className="font-mono text-[7px] uppercase tracking-[0.1em] opacity-70">
                      {editorHint}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  {["FILM", "WARM", "BW"].map((f) => (
                    <span
                      key={f}
                      className="border-2 px-2 py-1 font-mono text-[7px] font-bold uppercase"
                      style={{ borderColor: ps.text, borderRadius: ps.radius }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className="relative z-10 flex flex-1 items-center justify-center"
                style={{ backgroundColor: `color-mix(in srgb, ${ps.text} 4%, ${ps.bg})` }}
              >
                <span
                  className="flex h-2/3 w-1/2 items-center justify-center border-2 border-dashed font-mono text-[9px] uppercase tracking-[0.15em]"
                  style={{ borderColor: `color-mix(in srgb, ${ps.text} 30%, transparent)` }}
                >
                  FOTO + FRAME
                </span>
              </div>
            </div>
          )}

          {previewScreen === "result" && (
            <div
              className={`relative flex size-full overflow-hidden ${resultLayout === "qr-below" ? "flex-col" : "flex-row"}`}
              style={{ backgroundColor: ps.bg, color: ps.text }}
            >
              <PreviewVideo url={k.pages?.result?.video_url} />
              <div
                className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-2 p-3 ${
                  resultLayout === "qr-below"
                    ? "border-b-2"
                    : resultLayout === "qr-left"
                      ? "border-l-2"
                      : "border-r-2"
                } ${resultLayout === "qr-left" ? "order-2" : ""}`}
                style={{ borderColor: ps.text, backgroundColor: ps.surface }}
              >
                <span
                  className="flex h-1/2 w-1/2 items-center justify-center border-2 border-dashed font-mono text-[8px] uppercase tracking-[0.15em]"
                  style={{ borderColor: `color-mix(in srgb, ${ps.text} 30%, transparent)` }}
                >
                  HASIL FOTO
                </span>
              </div>
              <div
                className={`relative z-10 flex flex-col justify-center gap-2 p-3 ${resultLayout === "qr-below" ? "w-full" : "w-[38%]"} ${pvAlignClass}`}
              >
                <h2
                  className="font-display uppercase leading-none tracking-tight"
                  style={{
                    fontSize: `${1.25 * ps.fontScale}rem`,
                    color: sSafe,
                    fontFamily: pvFont,
                  }}
                >
                  {resultTitle || "Foto kamu jadi!"}
                </h2>
                <p className="max-w-[20ch] font-mono text-[7px] uppercase leading-relaxed tracking-[0.1em] opacity-70">
                  {resultHint || "Scan QR untuk mengunduh hasil."}
                </p>
                <span
                  className="inline-block size-20 border-2"
                  style={{ borderColor: sSafe }}
                  aria-hidden
                />
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
          {"PRATINJAU 8 LAYAR KIOSK · WARNA, FONT, RADIUS, PADDING, & PERATAAN MENGIKUTI FORM."}
        </p>
      </aside>
    </div>
  );
}
