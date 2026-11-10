"use client";

/**
 * Editor hardware booth (printer foto / thermal / struk, kamera, template
 * default) + tombol deteksi bridge. Dashboard owner = override cloud; panel PIN
 * booth tetap jalur tulis mesin yang sah ke kolom yang sama.
 */

import { useCallback, useState } from "react";
import { Loader2, Radar, Save } from "lucide-react";

import { PrintTestPanel, type PrintTestResult } from "@/components/print/PrintTestPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { bridgeHeaders } from "@/lib/bridge-token";
import { cameraBridgeUrl } from "@/lib/camera-provider";
import { resolvePrintMode } from "@/lib/print/print-mode";
import type { PrintSettings } from "@/lib/kiosk-types";
import { reportPrintTestAction, savePhotoboxHardwareAction } from "@/server/hardware-actions";

const SECTION =
  "flex flex-col gap-4 border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111] md:p-5";
const LABEL = "font-mono text-[10px] font-bold uppercase tracking-[0.16em]";
const HEADING = "font-display text-lg uppercase leading-none tracking-[-0.01em]";
const NEUTRAL =
  "border-2 border-ink bg-muted px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em]";

export type HardwareDraft = {
  photo: NonNullable<PrintSettings["photo"]>;
  thermal: NonNullable<PrintSettings["thermal"]>;
  receipt: NonNullable<PrintSettings["receipt"]>;
  camera: {
    provider: "browser" | "bridge";
    preferred_device_id: string;
    countdown_seconds: number;
    capture_width: number;
    capture_height: number;
    mirror_preview: boolean;
    screen_orientation: "landscape" | "portrait";
  };
};

export type DetectedHardware = { printers: string[]; cameras: string[] };

type DetectState = "idle" | "busy" | "ok" | "unreachable";

type FieldProps = { label: string; hint?: string; children: React.ReactNode };

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={LABEL}>{label}</span>
      {children}
      {hint ? (
        <span className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/**
 * Dropdown nama perangkat hasil deteksi bridge + isian manual. Bridge mati
 * BUKAN error merah: operator tetap bisa mengetik nama printer/kamera.
 */
function DevicePicker({
  name,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}: {
  name: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const unique = [...new Set(options.filter(Boolean))];
  const known = unique.includes(value);
  return (
    <div className="flex flex-col gap-2">
      {unique.length > 0 ? (
        <Select
          aria-label={`${placeholder} terdeteksi`}
          value={known ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">— pilih hasil deteksi —</option>
          {unique.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : null}
      <Input
        id={name}
        name={name}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={128}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function HardwareDetectButton({
  bridgeUrl,
  onDetected,
}: {
  bridgeUrl?: string | null;
  onDetected: (hardware: DetectedHardware) => void;
}) {
  const [state, setState] = useState<DetectState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const detect = useCallback(async () => {
    setState("busy");
    setMessage(null);
    const base = cameraBridgeUrl({ bridge_url: bridgeUrl ?? undefined });
    const printers: string[] = [];
    const cameras: string[] = [];
    let reachable = false;

    try {
      const health = await fetch(`${base}/health`, { cache: "no-store" });
      if (health.ok) {
        reachable = true;
        const body = (await health.json().catch(() => null)) as {
          camera?: boolean;
          model?: string;
        } | null;
        if (body?.camera && body.model) cameras.push(body.model);
      }
    } catch {
      /* bridge mati = keadaan normal di komputer owner */
    }

    if (reachable) {
      try {
        const response = await fetch(`${base}/printer/health`, {
          cache: "no-store",
          headers: bridgeHeaders(),
        });
        const body = (await response.json().catch(() => null)) as {
          printer?: string | null;
          ok?: boolean;
        } | null;
        if (body?.printer) printers.push(body.printer);
        else if (body?.ok) printers.push("Printer default OS");
      } catch {
        /* token belum diisi: tetap boleh isi manual */
      }
      try {
        const response = await fetch(`${base}/v1/camera/status`, {
          cache: "no-store",
          headers: bridgeHeaders(),
        });
        const body = (await response.json().catch(() => null)) as {
          model?: string;
          adapter?: string;
        } | null;
        if (body?.model) cameras.push(body.model);
        else if (body?.adapter) cameras.push(`Kamera ${body.adapter}`);
      } catch {
        /* idem */
      }
    }

    if (reachable) {
      setState("ok");
      setMessage(
        printers.length + cameras.length > 0
          ? `Bridge menjawab · ${printers.length} printer · ${cameras.length} kamera`
          : "Bridge menjawab, tidak ada perangkat terdaftar. Isi nama manual."
      );
    } else {
      setState("unreachable");
      setMessage(
        "Bridge lokal tidak menjawab. Isi nama perangkat manual, atau nyalakan bridge di komputer booth."
      );
    }
    onDetected({ printers, cameras });
  }, [bridgeUrl, onDetected]);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={state === "busy"}
        onClick={() => void detect()}
      >
        {state === "busy" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Radar className="size-4" aria-hidden />
        )}
        Deteksi ulang
      </Button>
      {message ? (
        <p role="status" className={state === "unreachable" ? NEUTRAL : `${NEUTRAL} bg-accent-3`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

type EditorProps<T> = {
  value: T;
  onChange: (patch: Partial<T>) => void;
  printers: string[];
  disabled?: boolean;
};

export function PhotoPathEditor({
  value,
  onChange,
  printers,
  disabled,
}: EditorProps<HardwareDraft["photo"]>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nama printer foto">
        <DevicePicker
          name="photo_printer_name"
          value={value.printer_name ?? ""}
          options={printers}
          placeholder="mis. DNP DS620"
          disabled={disabled}
          onChange={(printer_name) => onChange({ printer_name })}
        />
      </Field>
      <Field label="Jalur cetak foto">
        <Select
          value={value.mode ?? "browser"}
          disabled={disabled}
          onChange={(event) =>
            onChange({ mode: event.target.value as "browser" | "bluetooth" | "cups" })
          }
        >
          <option value="browser">Dialog OS (browser)</option>
          <option value="cups">CUPS / spooler bridge</option>
          <option value="bluetooth">Thermal Bluetooth</option>
        </Select>
      </Field>
      <Field label="Ukuran kertas">
        <Select
          value={value.paper_size ?? "4x6"}
          disabled={disabled}
          onChange={(event) =>
            onChange({ paper_size: event.target.value as "4x6" | "2x6" | "5x7" | "6x8" | "A6" })
          }
        >
          <option value="4x6">4x6 (10x15 cm)</option>
          <option value="2x6">2x6 (strip)</option>
          <option value="5x7">5x7 (13x18 cm)</option>
          <option value="6x8">6x8 (15x20 cm)</option>
          <option value="A6">A6</option>
        </Select>
      </Field>
      <Field label="Orientasi">
        <Select
          value={value.orientation ?? "portrait"}
          disabled={disabled}
          onChange={(event) =>
            onChange({ orientation: event.target.value as "portrait" | "landscape" | "auto" })
          }
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
          <option value="auto">Auto (ikuti foto)</option>
        </Select>
      </Field>
      <Field label="Penyesuaian gambar">
        <Select
          value={value.fit ?? "auto"}
          disabled={disabled}
          onChange={(event) =>
            onChange({ fit: event.target.value as "auto" | "contain" | "cover" })
          }
        >
          <option value="auto">Auto</option>
          <option value="contain">Utuh (tanpa crop)</option>
          <option value="cover">Penuh (crop terpusat)</option>
        </Select>
      </Field>
      <Field label="Margin (mm)">
        <Input
          type="number"
          min={0}
          max={20}
          value={value.margins_mm ?? 0}
          disabled={disabled}
          onChange={(event) => onChange({ margins_mm: Number(event.target.value) })}
        />
      </Field>
      <Field label="Nama media CUPS" hint="Kosong = Custom.WxHmm">
        <Input
          value={value.media_name ?? ""}
          maxLength={120}
          disabled={disabled}
          placeholder="mis. DNP_DS620_4x6"
          onChange={(event) => onChange({ media_name: event.target.value })}
        />
      </Field>
      <Field label="URL bridge lokal" hint="Kosong = 127.0.0.1:17777">
        <Input
          value={value.bridge_url ?? ""}
          maxLength={300}
          disabled={disabled}
          placeholder="http://127.0.0.1:17777"
          onChange={(event) => onChange({ bridge_url: event.target.value })}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3">
        <input
          type="checkbox"
          checked={value.enabled !== false}
          disabled={disabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
          className="size-5 accent-ink"
        />
        <span className={LABEL}>Cetak foto aktif</span>
      </label>
      <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3">
        <input
          type="checkbox"
          checked={value.auto_print === true}
          disabled={disabled}
          onChange={(event) => onChange({ auto_print: event.target.checked })}
          className="size-5 accent-ink"
        />
        <span className={LABEL}>Cetak otomatis</span>
      </label>
      <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.strip_2up === true}
          disabled={disabled}
          onChange={(event) => onChange({ strip_2up: event.target.checked })}
          className="size-5 accent-ink"
        />
        <span className={LABEL}>Dua strip per kertas 4x6 (2x6 x 2)</span>
      </label>
    </div>
  );
}

export function ThermalPhotoEditor({
  value,
  onChange,
  printers,
  disabled,
}: EditorProps<HardwareDraft["thermal"]>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nama printer thermal">
        <DevicePicker
          name="thermal_printer_name"
          value={value.printer_name ?? ""}
          options={printers}
          placeholder="mis. EPPOS 58BT"
          disabled={disabled}
          onChange={(printer_name) => onChange({ printer_name })}
        />
      </Field>
      <Field label="Lebar kertas">
        <Select
          value={String(value.paper_width_mm ?? 80)}
          disabled={disabled}
          onChange={(event) => onChange({ paper_width_mm: event.target.value === "58" ? 58 : 80 })}
        >
          <option value="58">58 mm</option>
          <option value="80">80 mm</option>
        </Select>
      </Field>
      <Field label="Nama perangkat Bluetooth" hint="Informasi petugas, bukan kredensial">
        <Input
          value={value.bluetooth_device_name ?? ""}
          maxLength={60}
          disabled={disabled}
          placeholder="mis. Printer Classic"
          onChange={(event) => onChange({ bluetooth_device_name: event.target.value })}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3">
        <input
          type="checkbox"
          checked={value.auto_print === true}
          disabled={disabled}
          onChange={(event) => onChange({ auto_print: event.target.checked })}
          className="size-5 accent-ink"
        />
        <span className={LABEL}>Cetak thermal otomatis</span>
      </label>
      <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.enabled !== false}
          disabled={disabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
          className="size-5 accent-ink"
        />
        <span className={LABEL}>Foto thermal aktif</span>
      </label>
    </div>
  );
}

export function ReceiptPathEditor({
  value,
  onChange,
  printers,
  disabled,
}: EditorProps<HardwareDraft["receipt"]>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nama printer struk">
        <DevicePicker
          name="receipt_printer_name"
          value={value.printer_name ?? ""}
          options={printers}
          placeholder="mis. Printer kasir"
          disabled={disabled}
          onChange={(printer_name) => onChange({ printer_name })}
        />
      </Field>
      <Field label="Jalur cetak struk">
        <Select
          value={value.mode ?? "browser"}
          disabled={disabled}
          onChange={(event) =>
            onChange({ mode: event.target.value as "browser" | "bluetooth" | "cups" })
          }
        >
          <option value="browser">Dialog OS (browser)</option>
          <option value="cups">CUPS / spooler bridge</option>
          <option value="bluetooth">Thermal Bluetooth</option>
        </Select>
      </Field>
      <Field label="Lebar kertas struk">
        <Select
          value={String(value.paper_width_mm ?? 58)}
          disabled={disabled}
          onChange={(event) => onChange({ paper_width_mm: event.target.value === "80" ? 80 : 58 })}
        >
          <option value="58">58 mm</option>
          <option value="80">80 mm</option>
        </Select>
      </Field>
      <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3">
        <input
          type="checkbox"
          checked={value.auto_print === true}
          disabled={disabled}
          onChange={(event) => onChange({ auto_print: event.target.checked })}
          className="size-5 accent-ink"
        />
        <span className={LABEL}>Struk otomatis</span>
      </label>
      <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.enabled !== false}
          disabled={disabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
          className="size-5 accent-ink"
        />
        <span className={LABEL}>Struk aktif</span>
      </label>
    </div>
  );
}

export function CameraSetupEditor({
  value,
  onChange,
  cameras,
  disabled,
}: {
  value: HardwareDraft["camera"];
  onChange: (patch: Partial<HardwareDraft["camera"]>) => void;
  cameras: string[];
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Sumber kamera">
        <Select
          value={value.provider}
          disabled={disabled}
          onChange={(event) =>
            onChange({ provider: event.target.value === "bridge" ? "bridge" : "browser" })
          }
        >
          <option value="browser">Kamera browser (webcam/USB)</option>
          <option value="bridge">Kamera bridge (DSLR / Pi Cam)</option>
        </Select>
      </Field>
      <Field label="Kamera terpilih">
        <DevicePicker
          name="preferred_device_id"
          value={value.preferred_device_id}
          options={cameras}
          placeholder="mis. Kamera USB / device id"
          disabled={disabled}
          onChange={(preferred_device_id) => onChange({ preferred_device_id })}
        />
      </Field>
      <Field label="Hitung mundur (detik)">
        <Input
          type="number"
          min={1}
          max={10}
          value={value.countdown_seconds}
          disabled={disabled}
          onChange={(event) => onChange({ countdown_seconds: Number(event.target.value) })}
        />
      </Field>
      <Field label="Orientasi layar booth">
        <Select
          value={value.screen_orientation}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              screen_orientation: event.target.value === "portrait" ? "portrait" : "landscape",
            })
          }
        >
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </Select>
      </Field>
      <Field label="Lebar capture (px)">
        <Input
          type="number"
          min={640}
          max={7680}
          value={value.capture_width}
          disabled={disabled}
          onChange={(event) => onChange({ capture_width: Number(event.target.value) })}
        />
      </Field>
      <Field label="Tinggi capture (px)">
        <Input
          type="number"
          min={480}
          max={4320}
          value={value.capture_height}
          disabled={disabled}
          onChange={(event) => onChange({ capture_height: Number(event.target.value) })}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.mirror_preview}
          disabled={disabled}
          onChange={(event) => onChange({ mirror_preview: event.target.checked })}
          className="size-5 accent-ink"
        />
        <span className={LABEL}>Pratinjau mirror</span>
      </label>
    </div>
  );
}

type PanelProps = {
  photoboxId: string;
  photoboxName: string;
  initial: HardwareDraft;
  templates: { id: string; name: string; is_global: boolean }[];
  defaultTemplateId: string | null;
  printSettings: PrintSettings;
  lastTest: {
    confirmed?: boolean;
    last_test_at?: string;
    mode?: string;
    device_name?: string;
  } | null;
  canWrite: boolean;
};

function Section({
  id,
  index,
  title,
  description,
  children,
  onSave,
  saving,
  disabled,
}: {
  id: string;
  index: string;
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}) {
  return (
    <section aria-labelledby={id} className={SECTION}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <p className={LABEL}>{`${index} / HARDWARE`}</p>
          <h2 id={id} className={`${HEADING} mt-1`}>
            {title}
          </h2>
        </div>
        <Button type="button" size="sm" disabled={saving || disabled} onClick={onSave}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Simpan
        </Button>
      </div>
      <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

export function PhotoboxHardwarePanel({
  photoboxId,
  photoboxName,
  initial,
  templates,
  defaultTemplateId,
  printSettings,
  lastTest,
  canWrite,
}: PanelProps) {
  const [draft, setDraft] = useState<HardwareDraft>(initial);
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "");
  const [detected, setDetected] = useState<DetectedHardware>({ printers: [], cameras: [] });
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);

  const update = useCallback(
    <K extends keyof HardwareDraft>(group: K, patch: Partial<HardwareDraft[K]>) => {
      setStatus(null);
      setDraft((prev) => ({ ...prev, [group]: { ...prev[group], ...patch } }));
    },
    []
  );

  async function save(group: "photo" | "thermal" | "receipt" | "camera" | "template") {
    if (!canWrite) return;
    setSavingGroup(group);
    setStatus(null);
    try {
      const result = await savePhotoboxHardwareAction({
        photobox_id: photoboxId,
        ...(group === "camera"
          ? {
              camera_settings: {
                provider: draft.camera.provider,
                preferred_device_id: draft.camera.preferred_device_id || null,
                countdown_seconds: draft.camera.countdown_seconds,
                capture_width: draft.camera.capture_width,
                capture_height: draft.camera.capture_height,
                mirror_preview: draft.camera.mirror_preview,
                screen_orientation: draft.camera.screen_orientation,
              },
            }
          : group === "template"
            ? { default_template_id: templateId || null }
            : { print_settings: { [group]: draft[group] } }),
      });
      const fieldMessage = result.fieldErrors
        ? Object.values(result.fieldErrors).flat()[0]
        : undefined;
      setStatus(
        result.error || fieldMessage
          ? { kind: "error", message: result.error ?? fieldMessage ?? "Gagal menyimpan." }
          : { kind: "ok", message: "Setelan tersimpan ke cloud." }
      );
    } finally {
      setSavingGroup(null);
    }
  }

  const onReport = useCallback(
    async (result: PrintTestResult) => {
      const applied = await reportPrintTestAction({
        photobox_id: photoboxId,
        confirmed: result.confirmed,
        mode: result.mode,
        device_name: result.device_name,
      });
      setStatus(
        applied.error
          ? { kind: "error", message: applied.error }
          : { kind: "ok", message: "Hasil uji cetak tersimpan." }
      );
    },
    [photoboxId]
  );

  const disabled = !canWrite;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-bg px-4 py-3">
        <p className={LABEL}>{`BOOTH · ${photoboxName}`}</p>
        <HardwareDetectButton
          bridgeUrl={printSettings.bridge_url ?? null}
          onDetected={setDetected}
        />
      </div>

      {status ? (
        <p
          role="status"
          className={
            status.kind === "error"
              ? "border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] text-ink"
              : "border-2 border-ink bg-accent-3 px-3 py-2 font-mono text-xs uppercase tracking-[0.08em]"
          }
        >
          {status.message}
        </p>
      ) : null}

      <Section
        id="photo-path-heading"
        index="01"
        title="Printer foto"
        description="Printer yang mencetak hasil foto. Nama diambil dari deteksi bridge; kalau bridge mati, ketik manual."
        onSave={() => void save("photo")}
        saving={savingGroup === "photo"}
        disabled={disabled}
      >
        <PhotoPathEditor
          value={draft.photo}
          onChange={(patch) => update("photo", patch)}
          printers={detected.printers}
          disabled={disabled}
        />
      </Section>

      <Section
        id="thermal-path-heading"
        index="02"
        title="Foto thermal"
        description="Foto 1-bit ke printer thermal ESC/POS (Web Bluetooth). Lebar dot mengikuti kertas 58/80 mm."
        onSave={() => void save("thermal")}
        saving={savingGroup === "thermal"}
        disabled={disabled}
      >
        <ThermalPhotoEditor
          value={draft.thermal}
          onChange={(patch) => update("thermal", patch)}
          printers={detected.printers}
          disabled={disabled}
        />
      </Section>

      <Section
        id="receipt-path-heading"
        index="03"
        title="Struk POS"
        description="Printer struk untuk transaksi POS. Terpisah dari printer foto supaya bahan tidak tercampur."
        onSave={() => void save("receipt")}
        saving={savingGroup === "receipt"}
        disabled={disabled}
      >
        <ReceiptPathEditor
          value={draft.receipt}
          onChange={(patch) => update("receipt", patch)}
          printers={detected.printers}
          disabled={disabled}
        />
      </Section>

      <Section
        id="camera-setup-heading"
        index="04"
        title="Kamera"
        description="Sumber kamera booth dan resolusi capture. Panel PIN booth tetap bisa menimpa nilai ini secara lokal."
        onSave={() => void save("camera")}
        saving={savingGroup === "camera"}
        disabled={disabled}
      >
        <CameraSetupEditor
          value={draft.camera}
          onChange={(patch) => update("camera", patch)}
          cameras={detected.cameras}
          disabled={disabled}
        />
      </Section>

      <Section
        id="default-template-heading"
        index="05"
        title="Template default"
        description="Template yang otomatis dipakai kiosk setelah pembayaran. Kosong = kiosk memilih otomatis bila hanya ada satu template, selain itu customer memilih sendiri."
        onSave={() => void save("template")}
        saving={savingGroup === "template"}
        disabled={disabled}
      >
        <Field label="Template default booth">
          <Select
            value={templateId}
            disabled={disabled}
            onChange={(event) => {
              setStatus(null);
              setTemplateId(event.target.value);
            }}
          >
            <option value="">Ikut template paket</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.is_global ? `${template.name} (global)` : template.name}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <PrintTestPanel
        mode={resolvePrintMode(printSettings)}
        paperWidthMm={printSettings.bluetooth_paper_width_mm === 58 ? 58 : 80}
        sample={{ title: "UJI CETAK", lines: ["DASHBOARD HARDWARE", photoboxName] }}
        lastTest={lastTest}
        printSettings={printSettings}
        onReport={onReport}
      />
    </div>
  );
}
