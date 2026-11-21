"use client";

import { useMemo, useState, type ReactNode } from "react";

import { DesignBuilderPreview } from "@/components/dashboard/DesignBuilderPreview";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { LABEL_CLASS } from "@/lib/form-ui";
import { mergeBranding, brandingHasOverride } from "@/lib/branding-merge";
import { contrastRatio } from "@/lib/color";
import { KIOSK_PAGE_OPTIONS } from "@/lib/kiosk-pages";
import {
  KIOSK_ELEMENTS,
  kioskElementDefs,
  type KioskElementConfig,
  type KioskElementsConfig,
} from "@/lib/kiosk-elements";
import type {
  BrandingConfig,
  KioskBrandingConfig,
  KioskPageConfig,
  KioskPageId,
} from "@/lib/kiosk-types";
import type { FormState } from "@/server/auth-actions";
import {
  resetBoothBrandingAction,
  saveBrandingAction,
  uploadBrandAssetAction,
} from "@/server/design-builder-actions";

const PAGES: { id: KioskPageId; label: string }[] = KIOSK_PAGE_OPTIONS.map(({ id, label }) => ({
  id,
  label,
}));

const PAGE_COPY: Record<
  Exclude<KioskPageId, "welcome">,
  { title: KioskTextKey; hint?: KioskTextKey }
> = {
  guide: { title: "guide_title" },
  package: { title: "package_title" },
  payment: { title: "payment_title", hint: "payment_hint" },
  template: { title: "template_title" },
  capture: { title: "capture_title", hint: "capture_hint" },
  edit: { title: "editor_title", hint: "editor_hint" },
  result: { title: "result_title", hint: "result_hint" },
};

type KioskTextKey =
  | "payment_title"
  | "payment_hint"
  | "capture_title"
  | "capture_hint"
  | "editor_title"
  | "editor_hint"
  | "result_title"
  | "result_hint"
  | "guide_title"
  | "guide_button"
  | "package_title"
  | "template_title";

type TopTextKey =
  | "welcome_title"
  | "welcome_tagline"
  | "welcome_button"
  | "primary_color"
  | "secondary_color"
  | "logo_key";

type BoothOption = {
  id: string;
  name: string;
  slug: string;
  override: BrandingConfig | null;
  orientation: "portrait" | "landscape" | null;
};

type Props = {
  businessName: string;
  globalBranding: BrandingConfig;
  booths: BoothOption[];
  initialBoothId: string | null;
  signedUrls: Record<string, string>;
  canBooth: boolean;
  canGlobal: boolean;
};

type PendingNav = { kind: "scope"; value: "global" | "booth" } | { kind: "booth"; value: string };

type UploadStatus = "idle" | "uploading" | "success" | "error";
type UploadState = Record<string, { status: UploadStatus; message?: string }>;

const HEX_RE = /^#[0-9a-f]{6}$/i;
const TEXT_OVERRIDE_IDS = new Set([
  "eyebrow",
  "title",
  "hint",
  "tagline",
  "business",
  "cta",
  "back",
  "footer",
]);
const ELEMENT_TEXT_DEFAULT: Record<string, string> = {
  eyebrow: "Label kecil",
  title: "Judul layar",
  hint: "Teks bantuan",
  tagline: "Abadikan momenmu.",
  business: "Nama bisnis",
  cta: "Lanjut",
  back: "Kembali",
  footer: "Catatan bawah",
};
const LOGO_TYPES = "image/png,image/jpeg,image/webp";
const VIDEO_TYPES = "video/mp4,video/webm";

function withUrls(branding: BrandingConfig, urls: Record<string, string>): BrandingConfig {
  const pages: Record<string, KioskPageConfig> = {};
  for (const [key, page] of Object.entries(branding.kiosk?.pages ?? {})) {
    if (!page) continue;
    pages[key] = {
      ...page,
      video_url: page.video_key ? (urls[page.video_key] ?? null) : null,
    };
  }
  return {
    ...branding,
    logo_url: branding.logo_key ? (urls[branding.logo_key] ?? null) : null,
    kiosk: {
      ...branding.kiosk,
      video_url: branding.kiosk?.video_key ? (urls[branding.kiosk.video_key] ?? null) : null,
      pages,
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function formatNumber(value: number, step: number, unit?: string): string {
  const digits = step < 1 ? 2 : 0;
  return `${value.toFixed(digits)}${unit ?? ""}`;
}

function resolveColor(value: string, fallback?: string): string {
  if (HEX_RE.test(value)) return value;
  if (fallback && HEX_RE.test(fallback)) return fallback;
  return "";
}

function fieldIdForError(key: string): string {
  const staticMap: Record<string, string> = {
    primary_color: "primary-color",
    secondary_color: "secondary-color",
    welcome_title: "welcome-title",
    welcome_tagline: "welcome-tagline",
    welcome_button: "welcome-button",
    logo_key: "logo-file",
    "kiosk.bg_color": "kiosk-bg",
    "kiosk.text_color": "kiosk-text",
    "kiosk.font_family": "kiosk-font",
    "kiosk.font_scale": "kiosk-scale",
    "kiosk.button_radius": "kiosk-radius",
    "kiosk.padding": "kiosk-padding",
    "kiosk.align": "kiosk-align",
    "kiosk.video_key": "kiosk-video",
  };
  const direct = staticMap[key];
  if (direct) return direct;
  if (key.startsWith("kiosk.show_") || key.startsWith("kiosk.allow_")) {
    return `kiosk-${key.slice("kiosk.".length)}`;
  }
  if (key.startsWith("kiosk.pages.")) {
    const parts = key.split(".");
    if (parts.includes("elements")) return "elements-section";
    const field = parts[parts.length - 1] ?? "";
    const pageMap: Record<string, string> = {
      bg_color: "page-bg",
      text_color: "page-text",
      font_scale: "page-scale",
      button_radius: "page-radius",
      padding: "page-padding",
      align: "page-align",
      video_key: "page-video",
    };
    return pageMap[field] ?? "page-select";
  }
  return "design-form";
}

function pageForError(key: string): KioskPageId | null {
  if (!key.startsWith("kiosk.pages.")) return null;
  const page = key.split(".")[2];
  return PAGES.some((item) => item.id === page) ? (page as KioskPageId) : null;
}

function tabForError(key: string): string {
  if (key.startsWith("kiosk.pages.")) return "layar";
  if (key.startsWith("kiosk.")) return "tampilan";
  if (key.startsWith("welcome_")) return "sambutan";
  return "merek";
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "Aset aktif";
  } catch {
    return "Aset aktif";
  }
}

function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

async function validateFile(
  file: File,
  kind: "logo" | "video" | "page-video"
): Promise<string | null> {
  if (kind === "logo") {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return "Format logo harus PNG, JPG, atau WebP.";
    }
    if (file.size > 2 * 1024 * 1024) return "Ukuran logo maksimal 2 MB.";
    return null;
  }
  if (!["video/mp4", "video/webm"].includes(file.type)) {
    return "Format video harus MP4 atau WebM.";
  }
  if (file.size > 15 * 1024 * 1024) return "Ukuran video maksimal 15 MB.";
  const duration = await videoDuration(file);
  if (duration !== null && duration > 5.5) return "Durasi video maksimal 5 detik.";
  return null;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="font-mono text-[11px] leading-snug text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="font-mono text-[10px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

function TextField({
  id,
  label,
  value,
  placeholder,
  hint,
  error,
  disabled,
  maxLength,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function ColorField({
  id,
  label,
  value,
  placeholder,
  hint,
  error,
  disabled,
  contrast,
  resetLabel,
  onChange,
  onReset,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  contrast?: { foreground: string; background: string; label: string };
  resetLabel?: string;
  onChange: (value: string) => void;
  onReset?: () => void;
}) {
  const swatch = resolveColor(value, placeholder) || "#111111";
  const ratio =
    contrast && HEX_RE.test(contrast.foreground) && HEX_RE.test(contrast.background)
      ? contrastRatio(contrast.foreground, contrast.background)
      : null;

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}, pemilih warna`}
          value={swatch}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-none border-2 border-ink bg-surface p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          id={id}
          value={value.toUpperCase()}
          placeholder={placeholder}
          maxLength={7}
          pattern="^#[0-9A-Fa-f]{6}$"
          title="Kode hex 6 digit, contoh #FFD400"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, hint, error)}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 font-mono uppercase"
        />
      </div>
      {value && onReset ? (
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="min-h-11 w-fit border-2 border-ink bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {resetLabel ?? "Kembalikan ke global"}
        </button>
      ) : null}
      {ratio !== null && contrast ? (
        <p
          aria-live="polite"
          className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
            ratio >= 4.5 ? "text-accent-3-strong" : "text-destructive"
          }`}
        >
          Kontras {ratio.toFixed(2)}:1 · {ratio >= 4.5 ? "Lolos AA" : "Gagal AA"} · {contrast.label}
        </p>
      ) : null}
    </Field>
  );
}

function RangeField({
  id,
  label,
  value,
  fallback,
  min,
  max,
  step,
  unit,
  inheritedHint,
  resetLabel,
  disabled,
  onChange,
  onReset,
}: {
  id: string;
  label: string;
  value: number | undefined;
  fallback: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  inheritedHint: string;
  resetLabel: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  const clamp = (input: number) => Math.min(max, Math.max(min, input));
  const current = clamp(value ?? fallback);
  const display = formatNumber(current, step, unit);
  const hint =
    value === undefined
      ? `${inheritedHint}: ${formatNumber(clamp(fallback), step, unit)}`
      : undefined;

  return (
    <Field id={id} label={label} hint={hint}>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[current]}
        disabled={disabled}
        aria-valuetext={display}
        aria-describedby={describedBy(id, hint)}
        onValueChange={(next) => onChange(Number(Array.isArray(next) ? next[0] : next))}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {formatNumber(min, step, unit)}
        </span>
        <span className="font-mono text-xs font-bold uppercase">{display}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {formatNumber(max, step, unit)}
        </span>
      </div>
      {value !== undefined ? (
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="min-h-11 w-fit border-2 border-ink bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {resetLabel}
        </button>
      ) : null}
    </Field>
  );
}

function BooleanField({
  id,
  label,
  value,
  inheritedLabel,
  inheritedValue,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: "" | "true" | "false";
  inheritedLabel: string;
  inheritedValue: string;
  disabled?: boolean;
  onChange: (value: "" | "true" | "false") => void;
}) {
  const options: { value: "" | "true" | "false"; label: string }[] = [
    { value: "", label: inheritedLabel },
    { value: "true", label: "Ya" },
    { value: "false", label: "Tidak" },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={LABEL_CLASS} id={`${id}-label`}>
        {label}
      </span>
      <div id={id} role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value || "inherit"}
            type="button"
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-11 flex-1 border-2 border-ink px-2 font-mono text-[10px] uppercase tracking-[0.06em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 ${
              value === option.value ? "bg-accent text-ink" : "bg-surface hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="font-mono text-[10px] leading-snug text-muted-foreground">
        Global saat ini: {inheritedValue}
      </p>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  hint,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  hint?: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function UploadField({
  id,
  label,
  accept,
  hint,
  status,
  statusMessage,
  disabled,
  activePreview,
  activeLabel,
  removeLabel,
  onFile,
  onRemove,
}: {
  id: string;
  label: string;
  accept: string;
  hint?: string;
  status: UploadStatus;
  statusMessage?: string;
  disabled?: boolean;
  activePreview?: ReactNode;
  activeLabel?: string;
  removeLabel?: string;
  onFile: (file: File) => void;
  onRemove?: () => void;
}) {
  const busy = status === "uploading";
  return (
    <Field id={id} label={label} hint={hint} error={status === "error" ? statusMessage : undefined}>
      <div className="flex flex-col gap-2">
        {activePreview ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {activePreview}
            <span className="min-w-0 break-words font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {activeLabel}
            </span>
          </div>
        ) : null}
        <Input
          id={id}
          type="file"
          accept={accept}
          disabled={disabled || busy}
          aria-invalid={status === "error"}
          aria-describedby={describedBy(id, hint, status === "error" ? statusMessage : undefined)}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.currentTarget.value = "";
          }}
          className="h-auto py-2 font-mono text-xs file:border-2 file:border-ink file:bg-accent file:px-2 file:py-1 file:font-mono file:text-[10px] file:uppercase"
        />
        <p className="font-mono text-[10px] leading-snug text-muted-foreground">
          Langsung aktif di kiosk setelah unggah.
        </p>
        {busy ? (
          <p
            role="status"
            aria-live="polite"
            className="font-mono text-[10px] uppercase text-muted-foreground"
          >
            Mengunggah...
          </p>
        ) : null}
        {status === "success" ? (
          <p
            role="status"
            aria-live="polite"
            className="font-mono text-[10px] uppercase text-accent-3-strong"
          >
            Aktif di kiosk
          </p>
        ) : null}
        {onRemove ? (
          <Button type="button" variant="neutral" size="sm" onClick={onRemove} disabled={disabled}>
            {removeLabel ?? "Hapus"}
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

export function DesignBuilder({
  businessName,
  globalBranding,
  booths,
  initialBoothId,
  signedUrls,
  canBooth,
  canGlobal,
}: Props) {
  const firstBooth = initialBoothId ?? booths[0]?.id ?? "";
  const initialScope: "global" | "booth" = booths.length > 0 && canBooth ? "booth" : "global";
  const [scope, setScope] = useState<"global" | "booth">(initialScope);
  const [boothId, setBoothId] = useState(firstBooth);
  const [baselineGlobal, setBaselineGlobal] = useState<BrandingConfig>(globalBranding);
  const [boothOverrides, setBoothOverrides] = useState<Record<string, BrandingConfig | null>>(() =>
    Object.fromEntries(booths.map((booth) => [booth.id, booth.override]))
  );
  const [draft, setDraft] = useState<BrandingConfig>(() =>
    initialScope === "booth" ? clone(boothOverrides[firstBooth] ?? {}) : clone(globalBranding)
  );
  const [extraUrls, setExtraUrls] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<FormState>({});
  const [resetKeys, setResetKeys] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({});
  const [page, setPage] = useState<KioskPageId>("welcome");
  const [activeTab, setActiveTab] = useState("merek");
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const urls = useMemo(() => ({ ...signedUrls, ...extraUrls }), [signedUrls, extraUrls]);
  const canWrite = scope === "booth" ? canBooth : canGlobal;
  const scopeBaseline = useMemo(
    () => (scope === "booth" ? (boothOverrides[boothId] ?? {}) : baselineGlobal),
    [scope, boothOverrides, boothId, baselineGlobal]
  );
  const inherited = scope === "booth" && !brandingHasOverride(boothOverrides[boothId]);
  const dirty = useMemo(
    () => stableStringify(draft) !== stableStringify(scopeBaseline) || resetKeys.length > 0,
    [draft, scopeBaseline, resetKeys]
  );
  const uploading = Object.values(uploadState).some((entry) => entry.status === "uploading");

  const currentBooth = booths.find((booth) => booth.id === boothId);
  const previewOrientation: "portrait" | "landscape" =
    scope === "booth" ? (currentBooth?.orientation ?? "portrait") : "portrait";

  const effective = useMemo(() => {
    const merged =
      scope === "booth" ? mergeBranding(baselineGlobal, draft) : mergeBranding({}, draft);
    return withUrls(merged, urls);
  }, [scope, baselineGlobal, draft, urls]);

  const errorFor = (key: string): string | undefined => saveState.fieldErrors?.[key]?.[0];

  const globalKiosk = baselineGlobal.kiosk ?? {};
  const resetLabel = scope === "booth" ? "Kembalikan ke global" : "Kembalikan ke bawaan";
  const inheritLabel = scope === "booth" ? "Ikuti global" : "Bawaan";

  const markReset = (path: string, cleared: boolean) => {
    if (scope !== "global") return;
    setResetKeys((current) =>
      cleared
        ? current.includes(path)
          ? current
          : [...current, path]
        : current.filter((item) => item !== path)
    );
  };

  const setTop = (key: TopTextKey, value: string | null) => {
    const cleared =
      value === null || value === undefined || (typeof value === "string" && value.trim() === "");
    markReset(key, cleared);
    setDraft((current) => {
      const next = { ...current };
      if (cleared) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const setKiosk = (key: keyof KioskBrandingConfig, value: unknown) => {
    const cleared =
      value === null || value === undefined || (typeof value === "string" && value.trim() === "");
    markReset(`kiosk.${String(key)}`, cleared);
    setDraft((current) => {
      const kiosk: Record<string, unknown> = { ...(current.kiosk ?? {}) };
      if (cleared) delete kiosk[key];
      else kiosk[key] = value;
      return { ...current, kiosk: kiosk as KioskBrandingConfig };
    });
  };

  const setPageField = <K extends keyof KioskPageConfig>(
    pageId: KioskPageId,
    key: K,
    value: KioskPageConfig[K] | "" | undefined
  ) => {
    const cleared =
      value === null || value === undefined || (typeof value === "string" && value.trim() === "");
    markReset(`kiosk.pages.${pageId}.${String(key)}`, cleared);
    setDraft((current) => {
      const pages: Record<string, KioskPageConfig> = { ...(current.kiosk?.pages ?? {}) };
      const nextPage: Record<string, unknown> = { ...(pages[pageId] ?? {}) };
      if (cleared) delete nextPage[key];
      else nextPage[key] = value;
      if (Object.keys(nextPage).length > 0) pages[pageId] = nextPage as KioskPageConfig;
      else delete pages[pageId];
      return {
        ...current,
        kiosk: { ...(current.kiosk ?? {}), pages } as KioskBrandingConfig,
      };
    });
  };

  const pageElements = useMemo<KioskElementsConfig>(
    () => draft.kiosk?.pages?.[page]?.elements ?? {},
    [draft, page]
  );

  const orderedElementIds = useMemo(() => {
    return (KIOSK_ELEMENTS[page] ?? [])
      .map((def, index) => ({
        id: def.id,
        index,
        order: pageElements[def.id]?.order ?? index,
      }))
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map((item) => item.id);
  }, [page, pageElements]);

  const setElement = (id: string, patch: Partial<KioskElementConfig> | null) => {
    const next: KioskElementConfig = { ...(pageElements[id] ?? {}) };
    if (patch === null) {
      for (const key of Object.keys(next) as (keyof KioskElementConfig)[]) delete next[key];
    } else {
      for (const [key, value] of Object.entries(patch) as [keyof KioskElementConfig, unknown][]) {
        if (value === undefined || value === null || value === "") delete next[key];
        else (next as Record<string, unknown>)[key] = value;
      }
    }
    const elements: KioskElementsConfig = { ...pageElements };
    if (Object.keys(next).length === 0) delete elements[id];
    else elements[id] = next;
    if (Object.keys(elements).length === 0) setPageField(page, "elements", undefined);
    else setPageField(page, "elements", elements);
  };

  const reorderElements = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = [...orderedElementIds];
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, fromId);
    const elements: KioskElementsConfig = { ...pageElements };
    ids.forEach((id, index) => {
      elements[id] = { ...(elements[id] ?? {}), order: index };
    });
    setPageField(page, "elements", elements);
  };

  const resetElements = () => {
    setPageField(page, "elements", undefined);
  };

  /**
   * Unggah logo = niat menampilkannya. Dua gate bisa membuat logo "tidak
   * muncul" walau unggahan sukses: `kiosk.show_logo` dan elemen `logo` yang
   * disembunyikan per layar. Nyalakan keduanya untuk layar sambutan, dengan
   * basis elemen efektif agar urutan/konfigurasi global tidak hilang.
   */
  const revealWelcomeLogo = () => {
    setKiosk("show_logo", true);
    const merged =
      scope === "booth" ? mergeBranding(baselineGlobal, draft) : mergeBranding({}, draft);
    const current = merged.kiosk?.pages?.welcome?.elements ?? {};
    const logo = current.logo ?? {};
    setPageField("welcome", "elements", {
      ...current,
      logo: { ...logo, visible: true },
    });
  };

  const applyScope = (next: "global" | "booth") => {
    setScope(next);
    setSaveState({});
    setResetKeys([]);
    setSavedAt(null);
    setUploadState({});
    setDraft(next === "global" ? clone(baselineGlobal) : clone(boothOverrides[boothId] ?? {}));
  };

  const applyBooth = (id: string) => {
    if (scope !== "booth") return;
    setBoothId(id);
    setSaveState({});
    setResetKeys([]);
    setSavedAt(null);
    setUploadState({});
    setDraft(clone(boothOverrides[id] ?? {}));
  };

  const requestScope = (next: "global" | "booth") => {
    if (next === scope || saving || uploading) return;
    if (next === "booth" && !canBooth) return;
    if (next === "global" && !canGlobal) return;
    if (dirty) setPendingNav({ kind: "scope", value: next });
    else applyScope(next);
  };

  const requestBooth = (id: string) => {
    if (scope !== "booth" || id === boothId || saving || uploading) return;
    if (dirty) setPendingNav({ kind: "booth", value: id });
    else applyBooth(id);
  };

  const applyPending = () => {
    const nav = pendingNav;
    setPendingNav(null);
    if (!nav) return;
    if (nav.kind === "scope") applyScope(nav.value);
    else applyBooth(nav.value);
  };

  const discardChanges = () => {
    setDraft(clone(scopeBaseline));
    setResetKeys([]);
    setSaveState({});
  };

  const runSave = async (): Promise<boolean> => {
    if (!canWrite || saving || uploading) return false;
    if (!dirty) return true;
    setSaving(true);
    setSaveState({});
    const result = await saveBrandingAction({
      scope,
      photoboxId: scope === "booth" ? boothId : undefined,
      branding: draft,
      resetKeys,
    });
    setSaving(false);
    setSaveState(result);
    if (result.fieldErrors) {
      const firstKey = Object.keys(result.fieldErrors)[0];
      if (firstKey) {
        setActiveTab(tabForError(firstKey));
        const errorPage = pageForError(firstKey);
        if (errorPage) setPage(errorPage);
      }
    }
    if (!result.error && !result.fieldErrors) {
      setSavedAt(new Date());
      setResetKeys([]);
      if (scope === "booth") {
        setBoothOverrides((current) => ({ ...current, [boothId]: clone(draft) }));
      } else {
        setBaselineGlobal(clone(draft));
      }
      return true;
    }
    return false;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSave();
  };

  const saveThenNavigate = async () => {
    const saved = await runSave();
    if (saved) applyPending();
  };

  const resetBooth = async (): Promise<string | void> => {
    if (!boothId) return "Pilih photobox terlebih dahulu.";
    setSaveState({});
    const result = await resetBoothBrandingAction(boothId);
    setSaveState(result);
    if (result.error || result.fieldErrors) {
      return result.error ?? "Gagal menghapus kustomisasi photobox.";
    }
    setBoothOverrides((current) => ({ ...current, [boothId]: null }));
    setDraft({});
    setResetKeys([]);
    setUploadState({});
    setSavedAt(new Date());
  };

  const setUpload = (key: string, status: UploadStatus, message?: string) => {
    setUploadState((current) => ({ ...current, [key]: { status, message } }));
  };

  const uploadAsset = (kind: "logo" | "video" | "page-video", file: File, pageId?: KioskPageId) => {
    const key = kind === "logo" ? "logo" : kind === "video" ? "video" : `page-${pageId ?? page}`;
    void (async () => {
      const validationError = await validateFile(file, kind);
      if (validationError) {
        setUpload(key, "error", validationError);
        return;
      }
      setUpload(key, "uploading");
      const formData = new FormData();
      formData.set("scope", scope);
      formData.set("kind", kind);
      if (scope === "booth") formData.set("photoboxId", boothId);
      if (pageId) formData.set("page", pageId);
      formData.set("file", file);

      const result = await uploadBrandAssetAction(formData);
      if (result.error || result.fieldErrors) {
        setUpload(
          key,
          "error",
          result.error ??
            Object.values(result.fieldErrors ?? {})[0]?.[0] ??
            "Gagal mengunggah aset."
        );
        return;
      }
      if (!result.key || !result.url) {
        setUpload(key, "error", "Aset tidak tersimpan. Coba lagi.");
        return;
      }
      const assetKey = result.key;
      setExtraUrls((current) => ({ ...current, [assetKey]: result.url! }));

      if (kind === "logo") {
        setTop("logo_key", assetKey);
        revealWelcomeLogo();
        if (scope === "booth") {
          setBoothOverrides((current) => ({
            ...current,
            [boothId]: { ...(current[boothId] ?? {}), logo_key: assetKey },
          }));
        } else {
          setBaselineGlobal((current) => ({ ...current, logo_key: assetKey }));
        }
      } else if (kind === "video") {
        setKiosk("video_key", assetKey);
        if (scope === "booth") {
          setBoothOverrides((current) => ({
            ...current,
            [boothId]: {
              ...(current[boothId] ?? {}),
              kiosk: { ...(current[boothId]?.kiosk ?? {}), video_key: assetKey },
            },
          }));
        } else {
          setBaselineGlobal((current) => ({
            ...current,
            kiosk: { ...(current.kiosk ?? {}), video_key: assetKey },
          }));
        }
      } else if (pageId) {
        setPageField(pageId, "video_key", assetKey);
        setBaselineGlobal((current) => ({
          ...current,
          kiosk: {
            ...(current.kiosk ?? {}),
            pages: {
              ...(current.kiosk?.pages ?? {}),
              [pageId]: { ...(current.kiosk?.pages?.[pageId] ?? {}), video_key: assetKey },
            },
          },
        }));
      }
      setUpload(key, "success");
    })();
  };

  const topValue = (key: TopTextKey) => {
    const value = draft[key];
    return typeof value === "string" ? value : "";
  };
  const globalTopValue = (key: TopTextKey) => {
    const value = baselineGlobal[key];
    return typeof value === "string" ? value : "";
  };
  const kioskText = (key: KioskTextKey) => {
    const value = draft.kiosk?.[key];
    return typeof value === "string" ? value : "";
  };
  const globalKioskText = (key: KioskTextKey) => {
    const value = globalKiosk[key];
    return typeof value === "string" ? value : "";
  };
  const pageNumber = (key: keyof KioskPageConfig) => {
    const value = draft.kiosk?.pages?.[page]?.[key];
    return typeof value === "number" ? value : undefined;
  };
  const globalPageNumber = (key: keyof KioskPageConfig) => {
    const value = globalKiosk.pages?.[page]?.[key];
    return typeof value === "number" ? value : undefined;
  };
  const pageText = (key: "bg_color" | "text_color") => {
    const value = draft.kiosk?.pages?.[page]?.[key];
    return typeof value === "string" ? value : "";
  };
  const globalPageText = (key: "bg_color" | "text_color") => {
    const value = globalKiosk.pages?.[page]?.[key];
    return typeof value === "string" ? value : "";
  };
  const pageAlign = draft.kiosk?.pages?.[page]?.align ?? "";
  const globalPageAlign = globalKiosk.pages?.[page]?.align ?? "";

  const booleanValue = (
    key: "show_logo" | "show_tagline" | "show_mirror_toggle" | "allow_zoom_pan"
  ): "" | "true" | "false" => {
    const value = draft.kiosk?.[key];
    return typeof value === "boolean" ? (value ? "true" : "false") : "";
  };
  const globalBoolean = (
    key: "show_logo" | "show_tagline" | "show_mirror_toggle" | "allow_zoom_pan"
  ) => {
    const value = globalKiosk[key];
    return typeof value === "boolean" ? (value ? "Ya" : "Tidak") : "Bawaan";
  };

  const kioskBg = resolveColor(
    typeof draft.kiosk?.bg_color === "string" ? draft.kiosk.bg_color : "",
    globalKiosk.bg_color || "#FFFDF5"
  );
  const kioskTextColor = resolveColor(
    typeof draft.kiosk?.text_color === "string" ? draft.kiosk.text_color : "",
    globalKiosk.text_color || "#111111"
  );
  const pageBg = resolveColor(pageText("bg_color"), globalPageText("bg_color") || kioskBg);
  const pageTextColor = resolveColor(
    pageText("text_color"),
    globalPageText("text_color") || kioskTextColor
  );

  const errorEntries = Object.entries(saveState.fieldErrors ?? {}).filter(
    ([key]) => fieldIdForError(key) !== "design-form"
  );
  const firstErrorId = errorEntries.length > 0 ? fieldIdForError(errorEntries[0]![0]) : null;
  const elementErrorEntry = Object.entries(saveState.fieldErrors ?? {}).find(([key]) =>
    key.startsWith(`kiosk.pages.${page}.elements`)
  );
  const statusText = dirty
    ? "Belum disimpan"
    : savedAt
      ? `Tersimpan ${savedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
      : "Tersimpan";

  const logoUpload = uploadState.logo;
  const videoUpload = uploadState.video;
  const pageUpload = uploadState[`page-${page}`];
  const logoKey = typeof draft.logo_key === "string" ? draft.logo_key : "";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
        <section
          aria-labelledby="design-editor-heading"
          className="flex min-w-0 flex-col border-2 border-ink bg-surface p-4 shadow-hard md:p-6"
        >
          <form
            id="design-form"
            onSubmit={handleSubmit}
            aria-busy={saving}
            className="flex min-w-0 flex-col gap-5"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  PENGATURAN TAMPILAN
                </p>
                <h2
                  id="design-editor-heading"
                  className="font-display text-lg font-bold uppercase leading-none tracking-tight"
                >
                  {scope === "booth" ? (currentBooth?.name ?? "Photobox ini") : "Branding global"}
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field id="booth-select" label="Photobox">
                <Select
                  id="booth-select"
                  value={boothId}
                  disabled={booths.length === 0 || saving || uploading || scope !== "booth"}
                  onChange={(event) => requestBooth(event.target.value)}
                >
                  {booths.length === 0 ? <option value="">Belum ada photobox</option> : null}
                  {booths.map((booth) => (
                    <option key={booth.id} value={booth.id}>
                      {booth.name} /{booth.slug}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className={LABEL_CLASS} id="scope-label">
                  Cakupan
                </span>
                <div role="group" aria-labelledby="scope-label" className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={scope === "booth"}
                    disabled={booths.length === 0 || saving || uploading || !canBooth}
                    onClick={() => requestScope("booth")}
                    className={`min-h-11 flex-1 border-2 border-ink px-2 font-mono text-[10px] uppercase tracking-[0.06em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 ${
                      scope === "booth" ? "bg-accent text-ink" : "bg-surface hover:bg-muted"
                    }`}
                  >
                    Photobox ini
                  </button>
                  <button
                    type="button"
                    aria-pressed={scope === "global"}
                    disabled={saving || uploading || !canGlobal}
                    onClick={() => requestScope("global")}
                    className={`min-h-11 flex-1 border-2 border-ink px-2 font-mono text-[10px] uppercase tracking-[0.06em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 ${
                      scope === "global" ? "bg-accent text-ink" : "bg-surface hover:bg-muted"
                    }`}
                  >
                    Global
                  </button>
                </div>
              </div>
            </div>

            {scope === "booth" && inherited ? (
              <Alert>
                Photobox ini mewarisi branding global. Ubah field lalu simpan untuk membuat
                kustomisasi.
              </Alert>
            ) : null}
            {!canWrite ? (
              <Alert className="bg-accent">
                Anda hanya dapat melihat. Perubahan memerlukan izin tulis.
              </Alert>
            ) : null}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList
                aria-label="Bagian pengaturan tampilan"
                className="grid w-full grid-cols-2 sm:grid-cols-4"
              >
                <TabsTrigger value="merek">Merek</TabsTrigger>
                <TabsTrigger value="sambutan">Sambutan</TabsTrigger>
                <TabsTrigger value="tampilan">Tampilan</TabsTrigger>
                <TabsTrigger value="layar">Per layar</TabsTrigger>
              </TabsList>

              <TabsContent value="merek" className="flex flex-col gap-6">
                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Logo
                  </legend>
                  <div className="mt-3">
                    <UploadField
                      id="logo-file"
                      label={effective.logo_url ? "Ganti logo" : "Unggah logo"}
                      accept={LOGO_TYPES}
                      hint="PNG, JPG, atau WebP. Maksimal 2 MB."
                      status={logoUpload?.status ?? "idle"}
                      statusMessage={logoUpload?.message}
                      disabled={!canWrite || saving}
                      activePreview={
                        effective.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={effective.logo_url}
                            alt={`Logo ${businessName}`}
                            className="h-16 w-auto max-w-[200px] object-contain"
                          />
                        ) : undefined
                      }
                      activeLabel={
                        scope === "booth"
                          ? logoKey
                            ? "Logo photobox"
                            : "Logo global"
                          : "Logo global"
                      }
                      removeLabel="Hapus logo"
                      onFile={(file) => uploadAsset("logo", file)}
                      onRemove={logoKey ? () => setTop("logo_key", null) : undefined}
                    />
                    {effective.logo_url &&
                    (effective.kiosk?.show_logo === false ||
                      effective.kiosk?.pages?.welcome?.elements?.logo?.visible === false) ? (
                      <div
                        role="status"
                        className="mt-3 flex flex-wrap items-center gap-2 border-2 border-ink bg-accent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink"
                      >
                        <span>Logo tersimpan, tetapi disembunyikan oleh setelan tampilan.</span>
                        <button
                          type="button"
                          onClick={revealWelcomeLogo}
                          disabled={!canWrite}
                          className="min-h-9 border-2 border-ink bg-surface px-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] shadow-hard-sm transition-transform active:translate-y-[1px] disabled:opacity-50"
                        >
                          Tampilkan logo
                        </button>
                      </div>
                    ) : null}
                  </div>
                </fieldset>

                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Warna merek
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ColorField
                      id="primary-color"
                      label="Warna aksen"
                      value={topValue("primary_color")}
                      placeholder={globalTopValue("primary_color") || "#FFD400"}
                      hint={
                        scope === "booth"
                          ? `Global: ${globalTopValue("primary_color") || "bawaan"}`
                          : undefined
                      }
                      error={errorFor("primary_color")}
                      disabled={!canWrite}
                      contrast={{
                        foreground: resolveColor(
                          topValue("secondary_color"),
                          globalTopValue("secondary_color") || "#111111"
                        ),
                        background: resolveColor(
                          topValue("primary_color"),
                          globalTopValue("primary_color") || "#FFD400"
                        ),
                        label: "Teks di tombol",
                      }}
                      resetLabel={resetLabel}
                      onChange={(value) => setTop("primary_color", value)}
                      onReset={() => setTop("primary_color", null)}
                    />
                    <ColorField
                      id="secondary-color"
                      label="Warna teks merek"
                      value={topValue("secondary_color")}
                      placeholder={globalTopValue("secondary_color") || "#111111"}
                      hint={
                        scope === "booth"
                          ? `Global: ${globalTopValue("secondary_color") || "bawaan"}`
                          : undefined
                      }
                      error={errorFor("secondary_color")}
                      disabled={!canWrite}
                      contrast={{
                        foreground: resolveColor(
                          topValue("secondary_color"),
                          globalTopValue("secondary_color") || "#111111"
                        ),
                        background: kioskBg,
                        label: "Teks di latar kiosk",
                      }}
                      resetLabel={resetLabel}
                      onChange={(value) => setTop("secondary_color", value)}
                      onReset={() => setTop("secondary_color", null)}
                    />
                  </div>
                </fieldset>
              </TabsContent>

              <TabsContent value="sambutan" className="flex flex-col gap-6">
                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Teks sambutan
                  </legend>
                  <div className="mt-3 flex flex-col gap-4">
                    <TextField
                      id="welcome-title"
                      label="Judul sambutan"
                      value={topValue("welcome_title")}
                      placeholder={globalTopValue("welcome_title") || businessName}
                      hint={scope === "booth" ? "Kosongkan untuk mengikuti global" : undefined}
                      error={errorFor("welcome_title")}
                      maxLength={120}
                      disabled={!canWrite}
                      onChange={(value) => setTop("welcome_title", value)}
                    />
                    <TextField
                      id="welcome-tagline"
                      label="Tagline"
                      value={topValue("welcome_tagline")}
                      placeholder={globalTopValue("welcome_tagline") || "Abadikan momenmu."}
                      hint={scope === "booth" ? "Kosongkan untuk mengikuti global" : undefined}
                      error={errorFor("welcome_tagline")}
                      maxLength={200}
                      disabled={!canWrite}
                      onChange={(value) => setTop("welcome_tagline", value)}
                    />
                    <TextField
                      id="welcome-button"
                      label="Label tombol mulai"
                      value={topValue("welcome_button")}
                      placeholder={globalTopValue("welcome_button") || "Mulai"}
                      hint={scope === "booth" ? "Kosongkan untuk mengikuti global" : undefined}
                      error={errorFor("welcome_button")}
                      maxLength={24}
                      disabled={!canWrite}
                      onChange={(value) => setTop("welcome_button", value)}
                    />
                  </div>
                </fieldset>
              </TabsContent>

              <TabsContent value="tampilan" className="flex flex-col gap-6">
                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Warna dan jenis huruf
                  </legend>
                  <div className="mt-3 flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <ColorField
                        id="kiosk-bg"
                        label="Latar kiosk"
                        value={
                          typeof draft.kiosk?.bg_color === "string" ? draft.kiosk.bg_color : ""
                        }
                        placeholder={globalKiosk.bg_color || "#FFFDF5"}
                        hint={
                          scope === "booth"
                            ? `Global: ${globalKiosk.bg_color || "bawaan"}`
                            : undefined
                        }
                        error={errorFor("kiosk.bg_color")}
                        disabled={!canWrite}
                        contrast={{
                          foreground: kioskTextColor,
                          background: kioskBg,
                          label: "Teks kiosk",
                        }}
                        resetLabel={resetLabel}
                        onChange={(value) => setKiosk("bg_color", value)}
                        onReset={() => setKiosk("bg_color", null)}
                      />
                      <ColorField
                        id="kiosk-text"
                        label="Teks kiosk"
                        value={
                          typeof draft.kiosk?.text_color === "string" ? draft.kiosk.text_color : ""
                        }
                        placeholder={globalKiosk.text_color || "#111111"}
                        hint={
                          scope === "booth"
                            ? `Global: ${globalKiosk.text_color || "bawaan"}`
                            : undefined
                        }
                        error={errorFor("kiosk.text_color")}
                        disabled={!canWrite}
                        contrast={{
                          foreground: kioskTextColor,
                          background: kioskBg,
                          label: "Teks di latar",
                        }}
                        resetLabel={resetLabel}
                        onChange={(value) => setKiosk("text_color", value)}
                        onReset={() => setKiosk("text_color", null)}
                      />
                    </div>
                    <SelectField
                      id="kiosk-font"
                      label="Jenis huruf"
                      value={draft.kiosk?.font_family ?? ""}
                      options={[
                        { value: "", label: inheritLabel },
                        { value: "display", label: "Display" },
                        { value: "sans", label: "Sans" },
                        { value: "mono", label: "Mono" },
                      ]}
                      hint={
                        scope === "booth"
                          ? `Global: ${globalKiosk.font_family ?? "display"}`
                          : undefined
                      }
                      error={errorFor("kiosk.font_family")}
                      disabled={!canWrite}
                      onChange={(value) => setKiosk("font_family", value)}
                    />
                  </div>
                </fieldset>

                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Ukuran dan perataan
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <RangeField
                      id="kiosk-scale"
                      label="Skala teks"
                      value={draft.kiosk?.font_scale}
                      fallback={globalKiosk.font_scale ?? 1}
                      min={0.8}
                      max={1.4}
                      step={0.05}
                      inheritedHint={scope === "booth" ? "Global" : "Bawaan"}
                      resetLabel={resetLabel}
                      disabled={!canWrite}
                      onChange={(value) => setKiosk("font_scale", value)}
                      onReset={() => setKiosk("font_scale", null)}
                    />
                    <RangeField
                      id="kiosk-radius"
                      label="Sudut tombol"
                      value={draft.kiosk?.button_radius}
                      fallback={globalKiosk.button_radius ?? 0}
                      min={0}
                      max={4}
                      step={1}
                      unit="px"
                      inheritedHint={scope === "booth" ? "Global" : "Bawaan"}
                      resetLabel={resetLabel}
                      disabled={!canWrite}
                      onChange={(value) => setKiosk("button_radius", value)}
                      onReset={() => setKiosk("button_radius", null)}
                    />
                    <RangeField
                      id="kiosk-padding"
                      label="Jarak tepi layar"
                      value={draft.kiosk?.padding}
                      fallback={globalKiosk.padding ?? 24}
                      min={16}
                      max={48}
                      step={4}
                      unit="px"
                      inheritedHint={scope === "booth" ? "Global" : "Bawaan"}
                      resetLabel={resetLabel}
                      disabled={!canWrite}
                      onChange={(value) => setKiosk("padding", value)}
                      onReset={() => setKiosk("padding", null)}
                    />
                    <SelectField
                      id="kiosk-align"
                      label="Perataan konten"
                      value={draft.kiosk?.align ?? ""}
                      options={[
                        { value: "", label: inheritLabel },
                        { value: "left", label: "Kiri" },
                        { value: "center", label: "Tengah" },
                        { value: "right", label: "Kanan" },
                      ]}
                      hint={
                        scope === "booth"
                          ? `Global: ${globalKiosk.align ?? "bawaan layar"}`
                          : undefined
                      }
                      error={errorFor("kiosk.align")}
                      disabled={!canWrite}
                      onChange={(value) => setKiosk("align", value)}
                    />
                  </div>
                </fieldset>

                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Elemen layar
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {(
                      [
                        ["show_logo", "Tampilkan logo"],
                        ["show_tagline", "Tampilkan tagline"],
                        ["show_mirror_toggle", "Tombol cermin kamera"],
                        ["allow_zoom_pan", "Perbesar dan geser"],
                      ] as const
                    ).map(([key, label]) => (
                      <BooleanField
                        key={key}
                        id={`kiosk-${key}`}
                        label={label}
                        value={booleanValue(key)}
                        inheritedLabel={inheritLabel}
                        inheritedValue={globalBoolean(key)}
                        disabled={!canWrite}
                        onChange={(value) => setKiosk(key, value === "" ? null : value === "true")}
                      />
                    ))}
                  </div>
                </fieldset>

                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Video latar
                  </legend>
                  <div className="mt-3">
                    <UploadField
                      id="kiosk-video"
                      label={
                        effective.kiosk?.video_url ? "Ganti video latar" : "Unggah video latar"
                      }
                      accept={VIDEO_TYPES}
                      hint="MP4 atau WebM. Maksimal 15 MB dan 5 detik."
                      status={videoUpload?.status ?? "idle"}
                      statusMessage={videoUpload?.message}
                      disabled={!canWrite || saving}
                      activePreview={
                        effective.kiosk?.video_url ? (
                          <video
                            src={effective.kiosk.video_url}
                            muted
                            playsInline
                            preload="metadata"
                            aria-hidden
                            className="h-16 w-auto max-w-[200px] object-cover"
                          />
                        ) : undefined
                      }
                      activeLabel={
                        effective.kiosk?.video_url
                          ? fileNameFromUrl(effective.kiosk.video_url)
                          : "Belum ada video"
                      }
                      removeLabel="Hapus video"
                      onFile={(file) => uploadAsset("video", file)}
                      onRemove={
                        draft.kiosk?.video_key ? () => setKiosk("video_key", null) : undefined
                      }
                    />
                  </div>
                </fieldset>
              </TabsContent>

              <TabsContent value="layar" className="flex flex-col gap-6">
                <div className="border-t-2 border-ink pt-4">
                  <SelectField
                    id="page-select"
                    label="Layar kiosk"
                    value={page}
                    options={PAGES.map((item) => ({ value: item.id, label: item.label }))}
                    onChange={(value) => setPage(value as KioskPageId)}
                  />
                </div>

                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Visual layar
                  </legend>
                  <div className="mt-3 flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <ColorField
                        id="page-bg"
                        label="Latar layar ini"
                        value={pageText("bg_color")}
                        placeholder={globalPageText("bg_color") || kioskBg}
                        hint={scope === "booth" ? "Kosongkan untuk mengikuti global" : undefined}
                        error={errorFor(`kiosk.pages.${page}.bg_color`)}
                        disabled={!canWrite}
                        contrast={{
                          foreground: pageTextColor,
                          background: pageBg,
                          label: "Teks layar",
                        }}
                        resetLabel={resetLabel}
                        onChange={(value) => setPageField(page, "bg_color", value)}
                        onReset={() => setPageField(page, "bg_color", "")}
                      />
                      <ColorField
                        id="page-text"
                        label="Teks layar ini"
                        value={pageText("text_color")}
                        placeholder={globalPageText("text_color") || kioskTextColor}
                        hint={scope === "booth" ? "Kosongkan untuk mengikuti global" : undefined}
                        error={errorFor(`kiosk.pages.${page}.text_color`)}
                        disabled={!canWrite}
                        contrast={{
                          foreground: pageTextColor,
                          background: pageBg,
                          label: "Teks di latar",
                        }}
                        resetLabel={resetLabel}
                        onChange={(value) => setPageField(page, "text_color", value)}
                        onReset={() => setPageField(page, "text_color", "")}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <RangeField
                        id="page-scale"
                        label="Skala teks layar"
                        value={pageNumber("font_scale")}
                        fallback={globalPageNumber("font_scale") ?? globalKiosk.font_scale ?? 1}
                        min={0.8}
                        max={1.4}
                        step={0.05}
                        inheritedHint={scope === "booth" ? "Global" : "Bawaan"}
                        resetLabel={resetLabel}
                        disabled={!canWrite}
                        onChange={(value) => setPageField(page, "font_scale", value)}
                        onReset={() => setPageField(page, "font_scale", "")}
                      />
                      <RangeField
                        id="page-padding"
                        label="Jarak tepi layar"
                        value={pageNumber("padding")}
                        fallback={globalPageNumber("padding") ?? globalKiosk.padding ?? 24}
                        min={16}
                        max={48}
                        step={4}
                        unit="px"
                        inheritedHint={scope === "booth" ? "Global" : "Bawaan"}
                        resetLabel={resetLabel}
                        disabled={!canWrite}
                        onChange={(value) => setPageField(page, "padding", value)}
                        onReset={() => setPageField(page, "padding", "")}
                      />
                      <RangeField
                        id="page-radius"
                        label="Sudut tombol layar"
                        value={pageNumber("button_radius")}
                        fallback={
                          globalPageNumber("button_radius") ?? globalKiosk.button_radius ?? 0
                        }
                        min={0}
                        max={4}
                        step={1}
                        unit="px"
                        inheritedHint={scope === "booth" ? "Global" : "Bawaan"}
                        resetLabel={resetLabel}
                        disabled={!canWrite}
                        onChange={(value) => setPageField(page, "button_radius", value)}
                        onReset={() => setPageField(page, "button_radius", "")}
                      />
                      <SelectField
                        id="page-align"
                        label="Perataan layar"
                        value={pageAlign}
                        options={[
                          {
                            value: "",
                            label: `${inheritLabel} (${globalPageAlign || globalKiosk.align || "bawaan layar"})`,
                          },
                          { value: "left", label: "Kiri" },
                          { value: "center", label: "Tengah" },
                          { value: "right", label: "Kanan" },
                        ]}
                        disabled={!canWrite}
                        onChange={(value) =>
                          setPageField(page, "align", value as KioskPageConfig["align"])
                        }
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset id="elements-section" className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Elemen &amp; urutan
                  </legend>
                  <p className="mt-2 font-mono text-[10px] leading-snug text-muted-foreground">
                    Seret untuk mengubah urutan. Sembunyikan, geser, atau ganti teks elemen.
                    Pratinjau mengikuti langsung.
                  </p>
                  {elementErrorEntry ? (
                    <div className="mt-2">
                      <Alert variant="destructive">{elementErrorEntry[1][0]}</Alert>
                    </div>
                  ) : null}
                  <ul className="mt-3 flex flex-col gap-2">
                    {orderedElementIds.map((id, index) => {
                      const def = kioskElementDefs(page).find((item) => item.id === id);
                      if (!def) return null;
                      const cfg = pageElements[id] ?? {};
                      const canText = TEXT_OVERRIDE_IDS.has(id);
                      const visibility =
                        cfg.visible === undefined ? "" : cfg.visible ? "true" : "false";
                      return (
                        <li
                          key={id}
                          onDragOver={(event) => {
                            if (dragId) event.preventDefault();
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (dragId) reorderElements(dragId, id);
                            setDragId(null);
                          }}
                          className={`flex flex-col gap-2 border-2 border-ink bg-surface p-2 ${
                            dragId === id ? "opacity-50" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              draggable
                              onDragStart={(event) => {
                                setDragId(id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", id);
                              }}
                              onDragEnd={() => setDragId(null)}
                              aria-label={`Seret ${def.label} untuk mengubah urutan`}
                              className="flex size-11 shrink-0 cursor-grab items-center justify-center border-2 border-ink bg-muted font-mono text-sm leading-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                            >
                              <span aria-hidden>⋮⋮</span>
                            </button>
                            <span className="min-w-0 flex-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
                              {def.label}
                            </span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={index === 0 || !canWrite}
                                onClick={() => reorderElements(id, orderedElementIds[index - 1]!)}
                                className="min-h-11 border-2 border-ink bg-surface px-2 font-mono text-[10px] uppercase tracking-[0.06em] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                              >
                                Naik
                              </button>
                              <button
                                type="button"
                                disabled={index === orderedElementIds.length - 1 || !canWrite}
                                onClick={() => reorderElements(id, orderedElementIds[index + 1]!)}
                                className="min-h-11 border-2 border-ink bg-surface px-2 font-mono text-[10px] uppercase tracking-[0.06em] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                              >
                                Turun
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <label className="flex min-w-0 flex-col gap-1">
                              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                Tampil
                              </span>
                              <Select
                                value={visibility}
                                disabled={!canWrite}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setElement(id, {
                                    visible: value === "" ? undefined : value === "true",
                                  });
                                }}
                              >
                                <option value="">Ikuti bawaan</option>
                                <option value="true">Tampil</option>
                                <option value="false">Sembunyi</option>
                              </Select>
                            </label>
                            <label className="flex min-w-0 flex-col gap-1">
                              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                Geser X
                              </span>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={-400}
                                max={400}
                                step={4}
                                value={cfg.offset_x ?? ""}
                                disabled={!canWrite}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  if (raw === "") {
                                    setElement(id, { offset_x: undefined });
                                    return;
                                  }
                                  const parsed = Number(raw);
                                  if (!Number.isFinite(parsed)) return;
                                  setElement(id, {
                                    offset_x: Math.min(400, Math.max(-400, Math.round(parsed))),
                                  });
                                }}
                                className="min-w-[5.5rem] font-mono"
                              />
                            </label>
                            <label className="flex min-w-0 flex-col gap-1">
                              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                Geser Y
                              </span>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={-400}
                                max={400}
                                step={4}
                                value={cfg.offset_y ?? ""}
                                disabled={!canWrite}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  if (raw === "") {
                                    setElement(id, { offset_y: undefined });
                                    return;
                                  }
                                  const parsed = Number(raw);
                                  if (!Number.isFinite(parsed)) return;
                                  setElement(id, {
                                    offset_y: Math.min(400, Math.max(-400, Math.round(parsed))),
                                  });
                                }}
                                className="min-w-[5.5rem] font-mono"
                              />
                            </label>
                          </div>
                          {canText ? (
                            <TextField
                              id={`element-text-${id}`}
                              label="Teks elemen"
                              value={cfg.text ?? ""}
                              placeholder={ELEMENT_TEXT_DEFAULT[id] ?? def.label}
                              maxLength={120}
                              disabled={!canWrite}
                              onChange={(value) => setElement(id, { text: value })}
                            />
                          ) : (
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                              Teks otomatis
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={resetElements}
                    disabled={!canWrite}
                    className="mt-3 min-h-11 w-fit border-2 border-ink bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                  >
                    Atur ulang elemen layar
                  </button>
                </fieldset>

                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Teks layar
                  </legend>
                  <div className="mt-3 flex flex-col gap-4">
                    {page === "welcome" ? (
                      <Alert>Teks sambutan diatur di tab Sambutan agar tidak ada duplikasi.</Alert>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <TextField
                          id="page-title"
                          label={`Judul ${PAGES.find((item) => item.id === page)?.label ?? page}`}
                          value={kioskText(PAGE_COPY[page].title)}
                          placeholder={globalKioskText(PAGE_COPY[page].title)}
                          hint={scope === "booth" ? "Kosongkan untuk mengikuti global" : undefined}
                          maxLength={80}
                          disabled={!canWrite}
                          onChange={(value) => setKiosk(PAGE_COPY[page].title, value)}
                        />
                        {PAGE_COPY[page].hint ? (
                          <TextField
                            id="page-hint"
                            label="Teks bantuan"
                            value={kioskText(PAGE_COPY[page].hint!)}
                            placeholder={globalKioskText(PAGE_COPY[page].hint!)}
                            hint={
                              scope === "booth" ? "Kosongkan untuk mengikuti global" : undefined
                            }
                            maxLength={160}
                            disabled={!canWrite}
                            onChange={(value) => setKiosk(PAGE_COPY[page].hint!, value)}
                          />
                        ) : null}
                        {page === "guide" ? (
                          <TextField
                            id="page-guide-button"
                            label="Label tombol petunjuk"
                            value={kioskText("guide_button")}
                            placeholder={globalKioskText("guide_button") || "Mulai"}
                            maxLength={24}
                            disabled={!canWrite}
                            onChange={(value) => setKiosk("guide_button", value)}
                          />
                        ) : null}
                      </div>
                    )}
                  </div>
                </fieldset>

                <fieldset className="min-w-0 border-t-2 border-ink pt-4">
                  <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Video layar
                  </legend>
                  <div className="mt-3">
                    {scope === "global" ? (
                      <UploadField
                        id="page-video"
                        label={
                          effective.kiosk?.pages?.[page]?.video_url
                            ? "Ganti video layar"
                            : `Unggah video ${PAGES.find((item) => item.id === page)?.label ?? page}`
                        }
                        accept={VIDEO_TYPES}
                        hint="MP4 atau WebM. Maksimal 15 MB dan 5 detik. Photobox mewarisi video ini."
                        status={pageUpload?.status ?? "idle"}
                        statusMessage={pageUpload?.message}
                        disabled={!canWrite || saving}
                        activePreview={
                          effective.kiosk?.pages?.[page]?.video_url ? (
                            <video
                              src={effective.kiosk.pages[page]!.video_url!}
                              muted
                              playsInline
                              preload="metadata"
                              aria-hidden
                              className="h-16 w-auto max-w-[200px] object-cover"
                            />
                          ) : undefined
                        }
                        activeLabel={
                          effective.kiosk?.pages?.[page]?.video_url
                            ? fileNameFromUrl(effective.kiosk.pages[page]!.video_url!)
                            : "Belum ada video layar"
                        }
                        removeLabel="Hapus video layar"
                        onFile={(file) => uploadAsset("page-video", file, page)}
                        onRemove={
                          draft.kiosk?.pages?.[page]?.video_key
                            ? () => setPageField(page, "video_key", null)
                            : undefined
                        }
                      />
                    ) : (
                      <Alert>
                        Video per layar dikelola di cakupan Global. Photobox mewarisinya otomatis.
                      </Alert>
                    )}
                  </div>
                </fieldset>
              </TabsContent>
            </Tabs>

            {saveState.error ? <Alert variant="destructive">{saveState.error}</Alert> : null}
            {errorEntries.length > 0 ? (
              <Alert variant="destructive">
                <p>
                  Periksa {errorEntries.length} field.{" "}
                  {firstErrorId ? (
                    <a
                      href={`#${firstErrorId}`}
                      onClick={(event) => {
                        event.preventDefault();
                        const key = errorEntries[0]![0];
                        setActiveTab(tabForError(key));
                        const errorPage = pageForError(key);
                        if (errorPage) setPage(errorPage);
                        requestAnimationFrame(() => {
                          const target = document.getElementById(firstErrorId);
                          target?.scrollIntoView({ block: "center" });
                          if (target instanceof HTMLElement) target.focus();
                        });
                      }}
                      className="font-bold underline"
                    >
                      Buka field pertama
                    </a>
                  ) : null}
                </p>
              </Alert>
            ) : null}

            <div
              className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-1 border-t-2 border-ink bg-surface px-4 py-3 md:-mx-6 md:-mb-6 md:px-6"
              aria-busy={saving}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  role="status"
                  aria-live="polite"
                  className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
                    dirty ? "text-muted-foreground" : "text-accent-3-strong"
                  }`}
                >
                  {saving ? "Menyimpan..." : statusText}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    disabled={!dirty || saving || uploading || !canWrite}
                    className="bg-accent"
                  >
                    {saving ? "Menyimpan..." : "Simpan"}
                  </Button>
                  <Button
                    type="button"
                    variant="neutral"
                    onClick={discardChanges}
                    disabled={!dirty || saving || uploading}
                  >
                    Batalkan perubahan
                  </Button>
                  {scope === "booth" && canBooth ? (
                    <details className="relative">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center border-2 border-ink bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                        Lainnya
                      </summary>
                      <div className="absolute bottom-full right-0 z-30 mb-2 w-[min(18rem,calc(100vw-2rem))] border-2 border-ink bg-surface p-2 shadow-hard">
                        <button
                          type="button"
                          disabled={!canWrite || saving || uploading}
                          onClick={(event) => {
                            event.currentTarget.closest("details")?.removeAttribute("open");
                            setResetOpen(true);
                          }}
                          className="min-h-11 w-full border-2 border-destructive bg-surface px-3 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-destructive hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:opacity-50"
                        >
                          Hapus kustomisasi photobox
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            </div>
          </form>
        </section>
      </div>

      <div className="order-1 min-w-0 lg:order-2">
        <DesignBuilderPreview
          key={previewOrientation}
          businessName={businessName}
          branding={effective}
          page={page}
          initialOrientation={previewOrientation}
        />
      </div>

      <Dialog
        open={pendingNav !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNav(null);
        }}
      >
        <DialogContent className="max-w-md" showClose={false}>
          <DialogTitle>Simpan perubahan?</DialogTitle>
          <DialogDescription>
            Perubahan pada{" "}
            {scope === "booth" ? (currentBooth?.name ?? "photobox ini") : "branding global"} belum
            disimpan. Pilih simpan, buang, atau batal sebelum pindah.
          </DialogDescription>
          <DialogFooter>
            <Button type="button" variant="neutral" size="sm" onClick={() => setPendingNav(null)}>
              Batal
            </Button>
            <Button type="button" variant="neutral" size="sm" onClick={applyPending}>
              Buang
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void saveThenNavigate()}
              disabled={saving}
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Hapus kustomisasi photobox"
        description="Semua kustomisasi photobox ini akan dihapus dan kembali mengikuti branding global. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus kustomisasi"
        cancelLabel="Batal"
        variant="destructive"
        onConfirm={resetBooth}
      />
    </div>
  );
}
