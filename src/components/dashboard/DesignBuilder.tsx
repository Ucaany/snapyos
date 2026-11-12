"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";

import { DesignBuilderPreview } from "@/components/dashboard/DesignBuilderPreview";
import { Alert } from "@/components/ui/neo/alert";
import { Slider } from "@/components/ui/neo/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/neo/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS } from "@/lib/form-ui";
import { mergeBranding, brandingHasOverride } from "@/lib/branding-merge";
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

const PAGES: { id: KioskPageId; label: string }[] = [
  { id: "welcome", label: "Beranda" },
  { id: "guide", label: "Petunjuk" },
  { id: "package", label: "Paket" },
  { id: "payment", label: "Pembayaran" },
  { id: "template", label: "Frame" },
  { id: "capture", label: "Ambil foto" },
  { id: "edit", label: "Edit" },
  { id: "result", label: "Hasil" },
];

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
        <p role="alert" className="font-mono text-[11px] leading-snug text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="font-mono text-[10px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
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
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
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
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          aria-label={`${label} (pemilih warna)`}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : (placeholder ?? "#111111")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-none border-2 border-ink bg-surface p-0 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          className="font-mono"
        />
      </div>
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
  inherited,
  allowClear = true,
  disabled,
  onChange,
  onClear,
}: {
  id: string;
  label: string;
  value: number | undefined;
  fallback: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  inherited: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
  onClear: () => void;
}) {
  const current = value ?? fallback;
  return (
    <Field
      id={id}
      label={label}
      hint={inherited ? `Mewarisi global: ${fallback}${unit ?? ""}` : undefined}
    >
      <div className="flex flex-col gap-2">
        <Slider
          id={id}
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold uppercase">
            {current}
            {unit ?? ""}
          </span>
          {!allowClear || inherited ? null : (
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="min-h-11 border-2 border-ink bg-surface px-2 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted disabled:opacity-50"
            >
              Warisi global
            </button>
          )}
        </div>
      </div>
    </Field>
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

function FileField({
  id,
  label,
  accept,
  hint,
  busy,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  accept: string;
  hint?: string;
  busy?: boolean;
  disabled?: boolean;
  onChange: (file: File) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChange(file);
          event.currentTarget.value = "";
        }}
        className="h-auto py-2 font-mono text-xs file:border-2 file:border-ink file:bg-accent file:px-2 file:py-1 file:font-mono file:text-[10px] file:uppercase"
      />
      {busy ? (
        <p role="status" className="font-mono text-[10px] uppercase text-muted-foreground">
          Mengunggah...
        </p>
      ) : null}
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
  const [scope, setScope] = useState<"global" | "booth">(booths.length > 0 ? "booth" : "global");
  const [boothId, setBoothId] = useState(firstBooth);
  const [baselineGlobal, setBaselineGlobal] = useState<BrandingConfig>(globalBranding);
  const [boothOverrides, setBoothOverrides] = useState<Record<string, BrandingConfig | null>>(() =>
    Object.fromEntries(booths.map((booth) => [booth.id, booth.override]))
  );
  const [draft, setDraft] = useState<BrandingConfig>(() =>
    booths.length > 0 ? clone(boothOverrides[firstBooth] ?? {}) : clone(globalBranding)
  );
  const [extraUrls, setExtraUrls] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<FormState>({});
  // Path bertitik yang harus DIHAPUS dari branding global saat simpan. Merge
  // server mempertahankan key yang tidak dikirim, jadi "Hapus"/"Default" global
  // harus dikirim eksplisit — bukan sekadar dihapus dari draft.
  const [resetKeys, setResetKeys] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [page, setPage] = useState<KioskPageId>("welcome");
  const [saving, startSave] = useTransition();
  const [uploading, startUpload] = useTransition();

  const urls = useMemo(() => ({ ...signedUrls, ...extraUrls }), [signedUrls, extraUrls]);
  const canWrite = scope === "booth" ? canBooth : canGlobal;
  const inherited = scope === "booth" && !brandingHasOverride(boothOverrides[boothId]);

  const effective = useMemo(() => {
    const merged =
      scope === "booth" ? mergeBranding(baselineGlobal, draft) : mergeBranding({}, draft);
    return withUrls(merged, urls);
  }, [scope, baselineGlobal, draft, urls]);

  const errorFor = (key: string): string | undefined =>
    saveState.fieldErrors?.[key]?.[0] ?? saveState.fieldErrors?.[key.split(".")[0] ?? ""]?.[0];

  const globalKiosk = baselineGlobal.kiosk ?? {};

  /** Catat/batalkan path yang harus dihapus saat simpan global. */
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
    const cleared = value === "" || value === null;
    setSaved(false);
    markReset(key, cleared);
    setDraft((current) => {
      const next = { ...current };
      if (cleared) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const setKiosk = (key: keyof KioskBrandingConfig, value: unknown) => {
    const cleared = value === "" || value === null || value === undefined;
    setSaved(false);
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
    value: KioskPageConfig[K] | ""
  ) => {
    const cleared = value === "" || value === undefined;
    setSaved(false);
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

  const selectScope = (next: "global" | "booth") => {
    setScope(next);
    setSaveState({});
    setSaved(false);
    setResetKeys([]);
    setDraft(next === "global" ? clone(baselineGlobal) : clone(boothOverrides[boothId] ?? {}));
  };

  const selectBooth = (id: string) => {
    setBoothId(id);
    setSaveState({});
    setSaved(false);
    setResetKeys([]);
    setDraft(scope === "booth" ? clone(boothOverrides[id] ?? {}) : clone(baselineGlobal));
  };

  const save = () => {
    setSaveState({});
    setSaved(false);
    startSave(async () => {
      const result = await saveBrandingAction({
        scope,
        photoboxId: scope === "booth" ? boothId : undefined,
        branding: draft,
        resetKeys,
      });
      setSaveState(result);
      if (!result.error && !result.fieldErrors) {
        setSaved(true);
        setResetKeys([]);
        if (scope === "booth") {
          setBoothOverrides((current) => ({ ...current, [boothId]: clone(draft) }));
        } else {
          setBaselineGlobal(clone(draft));
        }
      }
    });
  };

  const resetBooth = () => {
    if (!boothId) return;
    setSaveState({});
    setSaved(false);
    startSave(async () => {
      const result = await resetBoothBrandingAction(boothId);
      setSaveState(result);
      if (!result.error && !result.fieldErrors) {
        setBoothOverrides((current) => ({ ...current, [boothId]: null }));
        setDraft({});
        setResetKeys([]);
        setSaved(true);
      }
    });
  };

  const uploadAsset = (kind: "logo" | "video" | "page-video", file: File, pageId?: KioskPageId) => {
    setUploadError(null);
    const formData = new FormData();
    formData.set("scope", scope);
    formData.set("kind", kind);
    if (scope === "booth") formData.set("photoboxId", boothId);
    if (pageId) formData.set("page", pageId);
    formData.set("file", file);

    startUpload(async () => {
      const result = await uploadBrandAssetAction(formData);
      if (result.error || result.fieldErrors) {
        setUploadError(
          result.error ??
            Object.values(result.fieldErrors ?? {})[0]?.[0] ??
            "Gagal mengunggah aset."
        );
        return;
      }
      if (!result.key || !result.url) return;
      setExtraUrls((current) => ({ ...current, [result.key!]: result.url! }));

      if (kind === "logo") {
        setTop("logo_key", result.key);
        if (scope === "booth") {
          setBoothOverrides((current) => ({
            ...current,
            [boothId]: { ...(current[boothId] ?? {}), logo_key: result.key },
          }));
        } else {
          setBaselineGlobal((current) => ({ ...current, logo_key: result.key }));
        }
      } else if (kind === "video") {
        setKiosk("video_key", result.key);
        if (scope === "booth") {
          setBoothOverrides((current) => ({
            ...current,
            [boothId]: {
              ...(current[boothId] ?? {}),
              kiosk: { ...(current[boothId]?.kiosk ?? {}), video_key: result.key },
            },
          }));
        } else {
          setBaselineGlobal((current) => ({
            ...current,
            kiosk: { ...(current.kiosk ?? {}), video_key: result.key },
          }));
        }
      } else if (pageId) {
        setPageField(pageId, "video_key", result.key);
        setBaselineGlobal((current) => ({
          ...current,
          kiosk: {
            ...(current.kiosk ?? {}),
            pages: {
              ...(current.kiosk?.pages ?? {}),
              [pageId]: { ...(current.kiosk?.pages?.[pageId] ?? {}), video_key: result.key },
            },
          },
        }));
      }
    });
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
  ) => {
    const value = draft.kiosk?.[key];
    return typeof value === "boolean" ? String(value) : "";
  };
  const globalBoolean = (
    key: "show_logo" | "show_tagline" | "show_mirror_toggle" | "allow_zoom_pan"
  ) => {
    const value = globalKiosk[key];
    return typeof value === "boolean" ? (value ? "Ya" : "Tidak") : "Default";
  };

  const inheritLabel = scope === "booth" ? "Ikuti global" : "Default";
  const partial = saveState.fieldErrors && Object.keys(saveState.fieldErrors).length > 0;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-col gap-4 border-2 border-ink bg-surface p-4 shadow-hard">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="booth-select" label="Booth">
              <Select
                id="booth-select"
                value={boothId}
                disabled={booths.length === 0}
                onChange={(event) => selectBooth(event.target.value)}
              >
                {booths.length === 0 ? <option value="">Belum ada booth</option> : null}
                {booths.map((booth) => (
                  <option key={booth.id} value={booth.id}>
                    {booth.name} /{booth.slug}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={LABEL_CLASS}>Cakupan</span>
              <div
                role="group"
                aria-label="Cakupan branding"
                className="flex min-h-11 border-2 border-ink"
              >
                <button
                  type="button"
                  aria-pressed={scope === "booth"}
                  disabled={booths.length === 0}
                  onClick={() => selectScope("booth")}
                  className={`min-h-11 flex-1 px-2 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50 ${
                    scope === "booth" ? "bg-accent text-ink" : "bg-surface"
                  }`}
                >
                  Booth ini
                </button>
                <button
                  type="button"
                  aria-pressed={scope === "global"}
                  onClick={() => selectScope("global")}
                  className={`min-h-11 flex-1 border-l-2 border-ink px-2 font-mono text-[10px] uppercase tracking-[0.08em] ${
                    scope === "global" ? "bg-accent text-ink" : "bg-surface"
                  }`}
                >
                  Global
                </button>
              </div>
            </div>
          </div>

          {scope === "booth" && inherited ? (
            <Alert tone="info">
              Booth ini mewarisi branding global. Ubah field lalu simpan untuk membuat kustomisasi.
            </Alert>
          ) : null}
          {!canWrite ? (
            <Alert tone="warning">Anda hanya dapat melihat. Perubahan memerlukan izin tulis.</Alert>
          ) : null}

          <Tabs defaultValue="merek">
            <TabsList>
              <TabsTrigger value="merek">Merek</TabsTrigger>
              <TabsTrigger value="sambutan">Sambutan</TabsTrigger>
              <TabsTrigger value="tampilan">Tampilan</TabsTrigger>
              <TabsTrigger value="layar">Per Layar</TabsTrigger>
            </TabsList>

            <TabsContent value="merek" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3 border-2 border-ink bg-bg p-3">
                {effective.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={effective.logo_url}
                    alt={`Logo ${businessName}`}
                    className="max-h-16 w-auto max-w-[200px] object-contain"
                  />
                ) : (
                  <span className="flex size-14 items-center justify-center border-2 border-ink bg-surface font-display text-lg font-bold uppercase">
                    {businessName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {scope === "booth"
                    ? draft.logo_key
                      ? "Logo booth"
                      : "Logo global"
                    : "Logo global"}
                </span>
              </div>
              <FileField
                id="logo-file"
                label="Logo (PNG/JPG/WebP, maks 2 MB)"
                accept="image/png,image/jpeg,image/webp"
                busy={uploading}
                disabled={!canWrite}
                onChange={(file) => uploadAsset("logo", file)}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColorField
                  id="primary-color"
                  label="Warna aksen"
                  value={topValue("primary_color")}
                  placeholder={globalTopValue("primary_color") || "#FFD400"}
                  hint={
                    scope === "booth"
                      ? `Global: ${globalTopValue("primary_color") || "default"}`
                      : undefined
                  }
                  error={errorFor("primary_color")}
                  disabled={!canWrite}
                  onChange={(value) => setTop("primary_color", value)}
                />
                <ColorField
                  id="secondary-color"
                  label="Warna teks merek"
                  value={topValue("secondary_color")}
                  placeholder={globalTopValue("secondary_color") || "#111111"}
                  hint={
                    scope === "booth"
                      ? `Global: ${globalTopValue("secondary_color") || "default"}`
                      : undefined
                  }
                  error={errorFor("secondary_color")}
                  disabled={!canWrite}
                  onChange={(value) => setTop("secondary_color", value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="sambutan" className="flex flex-col gap-4">
              <TextField
                id="welcome-title"
                label="Judul sambutan"
                value={topValue("welcome_title")}
                placeholder={globalTopValue("welcome_title") || businessName}
                hint={scope === "booth" ? "Kosongkan untuk mewarisi global" : undefined}
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
                hint={scope === "booth" ? "Kosongkan untuk mewarisi global" : undefined}
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
                hint={scope === "booth" ? "Kosongkan untuk mewarisi global" : undefined}
                error={errorFor("welcome_button")}
                maxLength={24}
                disabled={!canWrite}
                onChange={(value) => setTop("welcome_button", value)}
              />
            </TabsContent>

            <TabsContent value="tampilan" className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColorField
                  id="kiosk-bg"
                  label="Latar kiosk"
                  value={typeof draft.kiosk?.bg_color === "string" ? draft.kiosk.bg_color : ""}
                  placeholder={globalKiosk.bg_color || "#FFFDF5"}
                  hint={
                    scope === "booth" ? `Global: ${globalKiosk.bg_color || "default"}` : undefined
                  }
                  error={errorFor("kiosk.bg_color")}
                  disabled={!canWrite}
                  onChange={(value) => setKiosk("bg_color", value)}
                />
                <ColorField
                  id="kiosk-text"
                  label="Teks kiosk"
                  value={typeof draft.kiosk?.text_color === "string" ? draft.kiosk.text_color : ""}
                  placeholder={globalKiosk.text_color || "#111111"}
                  hint={
                    scope === "booth" ? `Global: ${globalKiosk.text_color || "default"}` : undefined
                  }
                  error={errorFor("kiosk.text_color")}
                  disabled={!canWrite}
                  onChange={(value) => setKiosk("text_color", value)}
                />
              </div>

              <SelectField
                id="kiosk-font"
                label="Font"
                value={draft.kiosk?.font_family ?? ""}
                options={[
                  { value: "", label: inheritLabel },
                  { value: "display", label: "Display" },
                  { value: "sans", label: "Sans" },
                  { value: "mono", label: "Mono" },
                ]}
                hint={
                  scope === "booth" ? `Global: ${globalKiosk.font_family ?? "display"}` : undefined
                }
                error={errorFor("kiosk.font_family")}
                disabled={!canWrite}
                onChange={(value) => setKiosk("font_family", value)}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <RangeField
                  id="kiosk-scale"
                  label="Skala teks"
                  value={draft.kiosk?.font_scale}
                  fallback={globalKiosk.font_scale ?? 1}
                  min={0.8}
                  max={1.4}
                  step={0.05}
                  inherited={scope === "booth" && draft.kiosk?.font_scale === undefined}
                  allowClear={scope === "booth"}
                  disabled={!canWrite}
                  onChange={(value) => setKiosk("font_scale", value)}
                  onClear={() => setKiosk("font_scale", null)}
                />
                <RangeField
                  id="kiosk-radius"
                  label="Radius tombol"
                  value={draft.kiosk?.button_radius}
                  fallback={globalKiosk.button_radius ?? 0}
                  min={0}
                  max={24}
                  step={1}
                  unit="px"
                  inherited={scope === "booth" && draft.kiosk?.button_radius === undefined}
                  allowClear={scope === "booth"}
                  disabled={!canWrite}
                  onChange={(value) => setKiosk("button_radius", value)}
                  onClear={() => setKiosk("button_radius", null)}
                />
                <RangeField
                  id="kiosk-padding"
                  label="Padding layar"
                  value={draft.kiosk?.padding}
                  fallback={globalKiosk.padding ?? 24}
                  min={0}
                  max={96}
                  step={4}
                  unit="px"
                  inherited={scope === "booth" && draft.kiosk?.padding === undefined}
                  allowClear={scope === "booth"}
                  disabled={!canWrite}
                  onChange={(value) => setKiosk("padding", value)}
                  onClear={() => setKiosk("padding", null)}
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
                      ? `Global: ${globalKiosk.align ?? "default layar"}`
                      : undefined
                  }
                  error={errorFor("kiosk.align")}
                  disabled={!canWrite}
                  onChange={(value) => setKiosk("align", value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    ["show_logo", "Tampilkan logo"],
                    ["show_tagline", "Tampilkan tagline"],
                    ["show_mirror_toggle", "Tombol mirror kamera"],
                    ["allow_zoom_pan", "Zoom & geser di editor"],
                  ] as const
                ).map(([key, label]) => (
                  <SelectField
                    key={key}
                    id={`kiosk-${key}`}
                    label={label}
                    value={booleanValue(key)}
                    options={[
                      { value: "", label: `${inheritLabel} (${globalBoolean(key)})` },
                      { value: "true", label: "Ya" },
                      { value: "false", label: "Tidak" },
                    ]}
                    disabled={!canWrite}
                    onChange={(value) => setKiosk(key, value === "" ? null : value === "true")}
                  />
                ))}
              </div>

              <div className="border-2 border-ink bg-bg p-3">
                <FileField
                  id="kiosk-video"
                  label="Video latar kiosk (MP4/WebM, maks 15 MB, 5 detik)"
                  accept="video/mp4,video/webm"
                  hint={
                    effective.kiosk?.video_url
                      ? "Video aktif. Unggah baru untuk mengganti."
                      : scope === "booth"
                        ? "Booth mewarisi video global bila kosong."
                        : undefined
                  }
                  busy={uploading}
                  disabled={!canWrite}
                  onChange={(file) => uploadAsset("video", file)}
                />
                {effective.kiosk?.video_url ? (
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => setKiosk("video_key", null)}
                    className="mt-3 min-h-11 border-2 border-ink bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted disabled:opacity-50"
                  >
                    Hapus video
                  </button>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="layar" className="flex flex-col gap-4">
              <SelectField
                id="page-select"
                label="Layar kiosk"
                value={page}
                options={PAGES.map((item) => ({ value: item.id, label: item.label }))}
                onChange={(value) => setPage(value as KioskPageId)}
              />

              {page === "welcome" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField
                    id="page-welcome-title"
                    label="Judul beranda"
                    value={topValue("welcome_title")}
                    placeholder={globalTopValue("welcome_title") || businessName}
                    disabled={!canWrite}
                    onChange={(value) => setTop("welcome_title", value)}
                  />
                  <TextField
                    id="page-welcome-tagline"
                    label="Tagline beranda"
                    value={topValue("welcome_tagline")}
                    placeholder={globalTopValue("welcome_tagline") || "Abadikan momenmu."}
                    disabled={!canWrite}
                    onChange={(value) => setTop("welcome_tagline", value)}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField
                    id="page-title"
                    label={`Judul ${PAGES.find((item) => item.id === page)?.label ?? page}`}
                    value={kioskText(PAGE_COPY[page].title)}
                    placeholder={globalKioskText(PAGE_COPY[page].title)}
                    hint={scope === "booth" ? "Kosongkan untuk mewarisi global" : undefined}
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
                      hint={scope === "booth" ? "Kosongkan untuk mewarisi global" : undefined}
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColorField
                  id="page-bg"
                  label="Latar layar ini"
                  value={pageText("bg_color")}
                  placeholder={globalPageText("bg_color") || globalKiosk.bg_color || "#FFFDF5"}
                  hint={scope === "booth" ? "Kosongkan untuk mewarisi global" : undefined}
                  error={errorFor(`kiosk.pages.${page}.text_color`)}
                  disabled={!canWrite}
                  onChange={(value) => setPageField(page, "bg_color", value)}
                />
                <ColorField
                  id="page-text"
                  label="Teks layar ini"
                  value={pageText("text_color")}
                  placeholder={globalPageText("text_color") || globalKiosk.text_color || "#111111"}
                  hint={scope === "booth" ? "Kosongkan untuk mewarisi global" : undefined}
                  error={errorFor(`kiosk.pages.${page}.text_color`)}
                  disabled={!canWrite}
                  onChange={(value) => setPageField(page, "text_color", value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <RangeField
                  id="page-scale"
                  label="Skala teks layar"
                  value={pageNumber("font_scale")}
                  fallback={globalPageNumber("font_scale") ?? globalKiosk.font_scale ?? 1}
                  min={0.8}
                  max={1.4}
                  step={0.05}
                  inherited={pageNumber("font_scale") === undefined}
                  allowClear={scope === "booth"}
                  disabled={!canWrite}
                  onChange={(value) => setPageField(page, "font_scale", value)}
                  onClear={() => setPageField(page, "font_scale", "")}
                />
                <RangeField
                  id="page-padding"
                  label="Padding layar"
                  value={pageNumber("padding")}
                  fallback={globalPageNumber("padding") ?? globalKiosk.padding ?? 24}
                  min={0}
                  max={96}
                  step={4}
                  unit="px"
                  inherited={pageNumber("padding") === undefined}
                  allowClear={scope === "booth"}
                  disabled={!canWrite}
                  onChange={(value) => setPageField(page, "padding", value)}
                  onClear={() => setPageField(page, "padding", "")}
                />
                <RangeField
                  id="page-radius"
                  label="Radius tombol layar"
                  value={pageNumber("button_radius")}
                  fallback={globalPageNumber("button_radius") ?? globalKiosk.button_radius ?? 0}
                  min={0}
                  max={24}
                  step={1}
                  unit="px"
                  inherited={pageNumber("button_radius") === undefined}
                  allowClear={scope === "booth"}
                  disabled={!canWrite}
                  onChange={(value) => setPageField(page, "button_radius", value)}
                  onClear={() => setPageField(page, "button_radius", "")}
                />
                <SelectField
                  id="page-align"
                  label="Perataan layar"
                  value={pageAlign}
                  options={[
                    {
                      value: "",
                      label: `${inheritLabel} (${globalPageAlign || globalKiosk.align || "default layar"})`,
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

              <div className="border-2 border-ink bg-bg p-3">
                {scope === "global" ? (
                  <>
                    <FileField
                      id="page-video"
                      label={`Video layar ${PAGES.find((item) => item.id === page)?.label ?? page}`}
                      accept="video/mp4,video/webm"
                      hint="Global saja. Booth mewarisi video layar dari sini."
                      busy={uploading}
                      disabled={!canWrite}
                      onChange={(file) => uploadAsset("page-video", file, page)}
                    />
                    {effective.kiosk?.pages?.[page]?.video_url ? (
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => setPageField(page, "video_key", null)}
                        className="mt-3 min-h-11 border-2 border-ink bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-muted disabled:opacity-50"
                      >
                        Hapus video layar
                      </button>
                    ) : null}
                  </>
                ) : (
                  <Alert tone="info">
                    Video per layar dikelola di cakupan Global. Booth mewarisinya otomatis.
                  </Alert>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {uploadError ? <Alert tone="danger">{uploadError}</Alert> : null}
          {saveState.error ? <Alert tone="danger">{saveState.error}</Alert> : null}
          {partial ? <Alert tone="danger">Periksa kembali field yang ditandai.</Alert> : null}

          <div className="flex flex-wrap items-center gap-3 border-t-2 border-ink pt-4">
            <Button
              type="button"
              onClick={save}
              disabled={!canWrite || saving || (!boothId && scope === "booth")}
              className="bg-accent"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
            {scope === "booth" ? (
              <Button
                type="button"
                variant="outline"
                onClick={resetBooth}
                disabled={!canWrite || saving || !boothId}
              >
                Reset ke global
              </Button>
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {scope === "booth" ? "Mode booth" : "Mode global"}
            </span>
            {saved ? (
              <span
                role="status"
                className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent-3-strong"
              >
                Tersimpan
              </span>
            ) : null}
          </div>
        </section>
      </div>

      <div className="min-w-0">
        <DesignBuilderPreview businessName={businessName} branding={effective} />
      </div>
    </div>
  );
}
