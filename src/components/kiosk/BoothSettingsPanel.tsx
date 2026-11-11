"use client";

/**
 * Panel setelan booth — dijalankan DI DALAM aplikasi booth, bukan di dashboard.
 *
 * Pembagian yang dijaga panel ini (dan ditegakkan server, bukan hanya UI):
 *
 * | Milik booth (di sini)            | Milik cloud (website)              |
 * | -------------------------------- | ---------------------------------- |
 * | kamera: provider, countdown,     | harga & paket                      |
 * |   resolusi, mirror, orientasi    | payment gateway & kredensial       |
 * | printer: mode, kertas, margin    | `print_settings.copies` (biaya)    |
 * | sesi: timer, peringatan, retake  | `print_settings.layout` (produk)   |
 * | tampilan: warna, font, teks      | logo, warna brand, video, nama     |
 *
 * Panel hanya mengirim grup milik booth. `copies`/`layout` tidak dirender
 * sebagai input, dan kalau tetap terkirim runtime menjawab
 * `403 FIELD_NOT_DEVICE_OWNED` — bukan membuang nilainya diam-diam.
 *
 * Kenapa PIN: panel ini membuka akses ke kamera/printer dan bisa mengubah
 * tampilan yang dilihat pelanggan. Tanpa gerbang, siapa pun yang menyentuh
 * layar booth bisa mengacak setelan. PIN yang dipakai sama dengan PIN keluar
 * kiosk (diverifikasi cloud; PIN darurat lokal saat internet mati).
 */

import { useCallback, useState } from "react";
import { Save, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { KioskError } from "@/components/kiosk/api";
import { saveDeviceSettings } from "@/components/kiosk/local-runtime";
import {
  enableCupsPrinter,
  fetchPrinterStatus,
  listCupsPrinters,
  type PrinterStatusResult,
} from "@/lib/print/cups";
import { KIOSK_FIELD } from "@/components/kiosk/ui";
import type { DeviceSettings } from "@/lib/settings-merge";
import { APPEARANCE_PAGES, type AppearanceSettings } from "@/lib/appearance-merge";
import {
  boothDraftToSettings,
  type BoothAppearanceDraft,
  type BoothCameraDraft,
  type BoothPrintDraft,
  type BoothSessionDraft,
} from "@/lib/booth-settings-payload";

type Props = {
  /** Setelan aktif dari runtime (`GET /v1/settings`); `null` = runtime mati. */
  initial: DeviceSettings | null;
  /** `camera_settings.bridge_url` booth — tujuan `PUT /v1/settings`. */
  bridgeUrl?: string | null;
  /** Nama booth untuk judul panel — operator sering mengurus >1 booth. */
  photoboxName?: string;
  onSaved?: (settings: DeviceSettings) => void;
  onClose: () => void;
};

type Draft = {
  camera: BoothCameraDraft;
  print: BoothPrintDraft;
  session: BoothSessionDraft;
  appearance: BoothAppearanceDraft;
};

const DEFAULT_DRAFT: Draft = {
  camera: {
    provider: "browser",
    countdown_seconds: 3,
    capture_width: 1920,
    capture_height: 1080,
    mirror_preview: true,
    screen_orientation: "landscape",
  },
  print: {
    enabled: true,
    mode: "browser",
    paper_size: "4x6",
    orientation: "portrait",
    fit: "auto",
    strip_2up: false,
    media_name: "",
    auto_print: true,
    margins_mm: 0,
    printer_name: "",
    bridge_url: "",
  },
  session: {
    timer_seconds: 300,
    warning_seconds: 60,
    max_retakes: 2,
    kiosk_review_grid: true,
  },
  appearance: {
    bg_color: "#f5f1e8",
    text_color: "#111111",
    font_scale: 1,
    button_radius: 0,
    padding: 24,
    welcome_title: "",
    welcome_tagline: "",
    guide_steps: "",
  },
};

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Bentuk setelan tersimpan → draft form (semua field punya nilai). */
function toDraft(settings: DeviceSettings | null): Draft {
  const camera = settings?.camera_settings ?? {};
  const print = settings?.print_settings ?? {};
  const session = settings?.session_settings ?? {};
  const appearance = (settings?.appearance_settings ?? {}) as AppearanceSettings;
  return {
    camera: {
      provider: camera.provider && camera.provider !== "browser" ? "bridge" : "browser",
      countdown_seconds: num(camera.countdown_seconds, DEFAULT_DRAFT.camera.countdown_seconds),
      capture_width: num(camera.capture_width, DEFAULT_DRAFT.camera.capture_width),
      capture_height: num(camera.capture_height, DEFAULT_DRAFT.camera.capture_height),
      mirror_preview: bool(camera.mirror_preview, DEFAULT_DRAFT.camera.mirror_preview),
      screen_orientation: camera.screen_orientation === "portrait" ? "portrait" : "landscape",
    },
    print: {
      enabled: bool(print.enabled, DEFAULT_DRAFT.print.enabled),
      mode:
        print.mode === "bluetooth" || print.mode === "cups" ? print.mode : DEFAULT_DRAFT.print.mode,
      paper_size:
        print.paper_size === "A6" ||
        print.paper_size === "2x6" ||
        print.paper_size === "5x7" ||
        print.paper_size === "6x8"
          ? print.paper_size
          : "4x6",
      orientation:
        print.orientation === "landscape" || print.orientation === "auto"
          ? print.orientation
          : "portrait",
      fit: print.fit === "contain" || print.fit === "cover" ? print.fit : "auto",
      strip_2up: bool(print.strip_2up, false),
      media_name: str(print.media_name, ""),
      auto_print: bool(print.auto_print, DEFAULT_DRAFT.print.auto_print),
      margins_mm: num(print.margins_mm, DEFAULT_DRAFT.print.margins_mm),
      printer_name: str(print.printer_name, DEFAULT_DRAFT.print.printer_name),
      bridge_url: str(print.bridge_url, ""),
    },
    session: {
      timer_seconds: num(session.timer_seconds, DEFAULT_DRAFT.session.timer_seconds),
      warning_seconds: num(session.warning_seconds, DEFAULT_DRAFT.session.warning_seconds),
      max_retakes:
        session.max_retakes === null
          ? null
          : num(session.max_retakes, DEFAULT_DRAFT.session.max_retakes ?? 0),
      kiosk_review_grid: bool(session.kiosk_review_grid, true),
    },
    appearance: {
      bg_color: str(appearance.bg_color, DEFAULT_DRAFT.appearance.bg_color),
      text_color: str(appearance.text_color, DEFAULT_DRAFT.appearance.text_color),
      font_scale: num(appearance.font_scale, DEFAULT_DRAFT.appearance.font_scale),
      button_radius: num(appearance.button_radius, DEFAULT_DRAFT.appearance.button_radius),
      padding: num(appearance.padding, DEFAULT_DRAFT.appearance.padding),
      welcome_title: str(appearance.welcome_title, DEFAULT_DRAFT.appearance.welcome_title),
      welcome_tagline: str(appearance.welcome_tagline, DEFAULT_DRAFT.appearance.welcome_tagline),
      guide_steps: Array.isArray(appearance.guide_steps)
        ? appearance.guide_steps.join("\n")
        : DEFAULT_DRAFT.appearance.guide_steps,
    },
  };
}

const sectionClass = "flex flex-col gap-3 border-2 border-ink bg-surface p-4 md:p-5";
const labelClass = "font-mono text-[10px] font-bold uppercase tracking-[0.16em]";
const inputClass = `${KIOSK_FIELD} bg-bg font-mono`;
const headingClass = "font-display text-lg uppercase leading-none tracking-[-0.01em]";

export function BoothSettingsPanel({ initial, bridgeUrl, photoboxName, onSaved, onClose }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatusResult | null>(null);
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerList, setPrinterList] = useState<string[]>([]);

  // Tidak ada sinkronisasi efek dari props: panel di-mount ulang setiap kali
  // dibuka (induk merender kondisional), jadi `initial` hanya dibaca sekali
  // saat mount. Sinkronisasi lewat effect akan menimpa editan operator ketika
  // induk mengirim objek setelan baru di tengah pengisian form.

  const runtimeDown = initial === null;

  const update = useCallback(<K extends keyof Draft>(group: K, patch: Partial<Draft[K]>) => {
    setSaved(false);
    setError(null);
    setDraft((prev) => ({ ...prev, [group]: { ...prev[group], ...patch } }));
  }, []);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload = boothDraftToSettings(draft);
      const result = await saveDeviceSettings(payload, bridgeUrl);
      setSaved(true);
      onSaved?.(result);
    } catch (cause) {
      setError(
        cause instanceof KioskError
          ? cause.message
          : "Setelan gagal disimpan. Periksa runtime booth."
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshPrinterStatus() {
    setPrinterBusy(true);
    const status = await fetchPrinterStatus(
      { ...draft.print, bridge_url: draft.print.bridge_url ?? bridgeUrl ?? undefined },
      draft.print.printer_name || undefined
    );
    setPrinterStatus(status);
    setPrinterBusy(false);
  }

  async function detectPrinterList() {
    setPrinterBusy(true);
    const result = await listCupsPrinters({
      ...draft.print,
      bridge_url: draft.print.bridge_url ?? bridgeUrl ?? undefined,
    });
    setPrinterBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setPrinterList(result.printers.map((printer) => printer.name));
    if (!draft.print.printer_name) {
      const preferred = result.printers.find((printer) => printer.default) ?? result.printers[0];
      if (preferred) update("print", { printer_name: preferred.name });
    }
  }

  async function activatePrinter() {
    setPrinterBusy(true);
    const result = await enableCupsPrinter(
      { ...draft.print, bridge_url: draft.print.bridge_url ?? bridgeUrl ?? undefined },
      draft.print.printer_name || undefined
    );
    setPrinterBusy(false);
    if (result) setPrinterStatus(result);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-bg px-4 py-6 md:px-8">
      <header className="mx-auto flex w-full max-w-[860px] flex-col gap-2 border-b-2 border-ink/15 pb-4">
        <p className="font-mono text-[10px] font-bold uppercase leading-none tracking-[0.24em] text-muted-foreground">
          {`SETELAN BOOTH${photoboxName ? ` · ${photoboxName}` : ""}`}
        </p>
        <h1 className="font-display text-2xl uppercase leading-[0.95] tracking-[-0.02em] md:text-3xl">
          Setelan teknis booth ini
        </h1>
        <p className="max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
          Nilai di sini hanya berlaku untuk booth ini. Harga, paket, payment gateway, logo, dan
          warna brand tetap diatur dari website.
        </p>
      </header>

      {runtimeDown && (
        <div
          role="alert"
          className="mx-auto mt-4 flex w-full max-w-[860px] items-start gap-3 border-2 border-ink bg-accent-2 p-4"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-sm leading-relaxed">
            Runtime lokal booth tidak menjawab. Setelan tidak bisa disimpan sampai runtime hidup
            (aplikasi booth harus berjalan di komputer ini).
          </p>
        </div>
      )}

      <div className="mx-auto mt-5 flex w-full max-w-[860px] flex-col gap-4">
        {/* --- Kamera --- */}
        <section className={sectionClass} aria-labelledby="bs-camera">
          <h2 id="bs-camera" className={headingClass}>
            Kamera
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Sumber kamera</span>
              <select
                className={inputClass}
                value={draft.camera.provider}
                onChange={(e) =>
                  update("camera", {
                    provider: e.target.value === "bridge" ? "bridge" : "browser",
                  })
                }
              >
                <option value="browser">Kamera browser (webcam/USB)</option>
                <option value="bridge">Kamera bridge (DSLR / Pi Cam / Webcam via runtime)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Hitung mundur (detik)</span>
              <input
                type="number"
                min={1}
                max={10}
                className={inputClass}
                value={draft.camera.countdown_seconds}
                onChange={(e) => update("camera", { countdown_seconds: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Lebar capture (px)</span>
              <input
                type="number"
                min={640}
                max={7680}
                className={inputClass}
                value={draft.camera.capture_width}
                onChange={(e) => update("camera", { capture_width: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Tinggi capture (px)</span>
              <input
                type="number"
                min={480}
                max={4320}
                className={inputClass}
                value={draft.camera.capture_height}
                onChange={(e) => update("camera", { capture_height: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Orientasi layar booth</span>
              <select
                className={inputClass}
                value={draft.camera.screen_orientation}
                onChange={(e) =>
                  update("camera", {
                    screen_orientation: e.target.value === "portrait" ? "portrait" : "landscape",
                  })
                }
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3">
              <input
                type="checkbox"
                checked={draft.camera.mirror_preview}
                onChange={(e) => update("camera", { mirror_preview: e.target.checked })}
                className="size-5"
              />
              <span className={labelClass}>Pratinjau mirror</span>
            </label>
          </div>
        </section>

        {/* --- Printer --- */}
        <section className={sectionClass} aria-labelledby="bs-print">
          <h2 id="bs-print" className={headingClass}>
            Printer
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Jalur cetak</span>
              <select
                className={inputClass}
                value={draft.print.mode}
                onChange={(e) =>
                  update("print", {
                    mode:
                      e.target.value === "bluetooth"
                        ? "bluetooth"
                        : e.target.value === "cups"
                          ? "cups"
                          : "browser",
                  })
                }
              >
                <option value="browser">Dialog OS (browser)</option>
                <option value="cups">CUPS / spooler (runtime)</option>
                <option value="bluetooth">Thermal Bluetooth</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Ukuran kertas</span>
              <select
                className={inputClass}
                value={draft.print.paper_size}
                onChange={(e) =>
                  update("print", {
                    paper_size:
                      e.target.value === "A6" ||
                      e.target.value === "2x6" ||
                      e.target.value === "5x7" ||
                      e.target.value === "6x8"
                        ? e.target.value
                        : "4x6",
                  })
                }
              >
                <option value="4x6">4x6 (10x15 cm)</option>
                <option value="2x6">2x6 (strip 5x15 cm)</option>
                <option value="5x7">5x7 (13x18 cm)</option>
                <option value="6x8">6x8 (15x20 cm)</option>
                <option value="A6">A6</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Orientasi kertas</span>
              <select
                className={inputClass}
                value={draft.print.orientation}
                onChange={(e) =>
                  update("print", {
                    orientation:
                      e.target.value === "landscape"
                        ? "landscape"
                        : e.target.value === "auto"
                          ? "auto"
                          : "portrait",
                  })
                }
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
                <option value="auto">Auto (ikuti foto)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Penyesuaian gambar</span>
              <select
                className={inputClass}
                value={draft.print.fit}
                onChange={(e) =>
                  update("print", {
                    fit:
                      e.target.value === "contain" || e.target.value === "cover"
                        ? e.target.value
                        : "auto",
                  })
                }
              >
                <option value="auto">Auto (frame = utuh, foto = penuh)</option>
                <option value="contain">Utuh (tanpa crop)</option>
                <option value="cover">Penuh (crop terpusat)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Margin (mm)</span>
              <input
                type="number"
                min={0}
                max={20}
                className={inputClass}
                value={draft.print.margins_mm}
                onChange={(e) => update("print", { margins_mm: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Nama media CUPS (kosong = Custom.WxHmm)</span>
              <input
                type="text"
                maxLength={120}
                className={inputClass}
                placeholder="mis. DNP_DS620_4x6"
                value={draft.print.media_name}
                onChange={(e) => update("print", { media_name: e.target.value })}
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3 sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.print.strip_2up}
                onChange={(e) => update("print", { strip_2up: e.target.checked })}
                className="size-5"
              />
              <span className={labelClass}>Dua strip per kertas 4x6 (2x6 × 2)</span>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Nama printer (kosong = default OS)</span>
              <input
                type="text"
                maxLength={128}
                className={inputClass}
                placeholder="mis. DNP DS620"
                value={draft.print.printer_name}
                onChange={(e) => update("print", { printer_name: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={printerBusy}
                onClick={() => void detectPrinterList()}
                className="min-h-11 border-2 border-ink bg-bg px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] disabled:opacity-50"
              >
                Deteksi printer
              </button>
              <button
                type="button"
                disabled={printerBusy}
                onClick={() => void refreshPrinterStatus()}
                className="min-h-11 border-2 border-ink bg-bg px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] disabled:opacity-50"
              >
                Refresh status
              </button>
              {printerStatus?.state === "disabled" && (
                <button
                  type="button"
                  disabled={printerBusy}
                  onClick={() => void activatePrinter()}
                  className="min-h-11 border-2 border-ink bg-accent px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] disabled:opacity-50"
                >
                  Aktifkan printer
                </button>
              )}
            </div>
            {printerList.length > 0 && (
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                {printerList.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => update("print", { printer_name: name })}
                    className={`min-h-11 border-2 border-ink px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
                      draft.print.printer_name === name ? "bg-ink text-bg" : "bg-bg"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {printerStatus && (
              <p className="font-mono text-xs uppercase tracking-[0.08em] sm:col-span-2">
                {`Status printer: ${printerStatus.state}${printerStatus.media ? ` · media ${printerStatus.media}` : ""}${printerStatus.queue ? ` · antrean ${printerStatus.queue}` : ""}`}
              </p>
            )}
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>URL bridge lokal (kosong = 127.0.0.1:17777)</span>
              <input
                type="text"
                maxLength={300}
                className={inputClass}
                placeholder="http://127.0.0.1:17777"
                value={draft.print.bridge_url ?? ""}
                onChange={(e) => update("print", { bridge_url: e.target.value })}
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3">
              <input
                type="checkbox"
                checked={draft.print.enabled}
                onChange={(e) => update("print", { enabled: e.target.checked })}
                className="size-5"
              />
              <span className={labelClass}>Cetak aktif</span>
            </label>
            <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3">
              <input
                type="checkbox"
                checked={draft.print.auto_print}
                onChange={(e) => update("print", { auto_print: e.target.checked })}
                className="size-5"
              />
              <span className={labelClass}>Cetak otomatis</span>
            </label>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Jumlah salinan dan bentuk layout (single/strip) diatur owner di website — keduanya
            menyangkut biaya bahan dan bentuk produk, bukan kondisi mesin.
          </p>
        </section>

        {/* --- Sesi --- */}
        <section className={sectionClass} aria-labelledby="bs-session">
          <h2 id="bs-session" className={headingClass}>
            Sesi
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Durasi sesi (detik)</span>
              <input
                type="number"
                min={60}
                max={3600}
                className={inputClass}
                value={draft.session.timer_seconds}
                onChange={(e) => update("session", { timer_seconds: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Peringatan (detik)</span>
              <input
                type="number"
                min={10}
                max={600}
                className={inputClass}
                value={draft.session.warning_seconds}
                onChange={(e) => update("session", { warning_seconds: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Maks. ulang foto</span>
              <input
                type="number"
                min={0}
                max={50}
                className={inputClass}
                value={draft.session.max_retakes ?? ""}
                placeholder="tanpa batas"
                onChange={(e) =>
                  update("session", {
                    max_retakes: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-3 border-2 border-ink bg-bg px-3">
            <input
              type="checkbox"
              checked={draft.session.kiosk_review_grid !== false}
              onChange={(e) => update("session", { kiosk_review_grid: e.target.checked })}
              className="size-5"
            />
            <span className={labelClass}>Layar cek foto (review grid)</span>
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Peringatan harus lebih singkat dari durasi sesi — runtime menolak kombinasi sebaliknya.
            Matikan review grid untuk kembali langsung ke editor setelah capture.
          </p>
        </section>

        {/* --- Tampilan booth --- */}
        <section className={sectionClass} aria-labelledby="bs-appearance">
          <h2 id="bs-appearance" className={headingClass}>
            Tampilan booth ini
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Warna latar</span>
              <input
                type="color"
                className="h-11 w-full border-2 border-ink bg-bg"
                value={draft.appearance.bg_color}
                onChange={(e) => update("appearance", { bg_color: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Warna teks</span>
              <input
                type="color"
                className="h-11 w-full border-2 border-ink bg-bg"
                value={draft.appearance.text_color}
                onChange={(e) => update("appearance", { text_color: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Skala font (0.8–1.4)</span>
              <input
                type="number"
                step={0.05}
                min={0.8}
                max={1.4}
                className={inputClass}
                value={draft.appearance.font_scale}
                onChange={(e) => update("appearance", { font_scale: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Radius tombol (px)</span>
              <input
                type="number"
                min={0}
                max={4}
                className={inputClass}
                value={draft.appearance.button_radius}
                onChange={(e) => update("appearance", { button_radius: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Padding layar (px)</span>
              <input
                type="number"
                min={0}
                max={48}
                className={inputClass}
                value={draft.appearance.padding}
                onChange={(e) => update("appearance", { padding: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Judul sambutan (kosong = ikut website)</span>
              <input
                type="text"
                maxLength={120}
                className={inputClass}
                value={draft.appearance.welcome_title}
                onChange={(e) => update("appearance", { welcome_title: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Tagline (kosong = ikut website)</span>
              <input
                type="text"
                maxLength={200}
                className={inputClass}
                value={draft.appearance.welcome_tagline}
                onChange={(e) => update("appearance", { welcome_tagline: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Panduan (satu langkah per baris, maks 8)</span>
              <textarea
                rows={4}
                className="w-full border-2 border-ink bg-bg px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                value={draft.appearance.guide_steps}
                onChange={(e) => update("appearance", { guide_steps: e.target.value })}
              />
            </label>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Logo, warna brand, dan video promosi tetap milik website supaya brand konsisten di semua
            booth. Yang di sini hanya penyesuaian layar booth ini ({APPEARANCE_PAGES.length} layar
            didukung).
          </p>
        </section>

        {error && (
          <p role="alert" className="border-2 border-ink bg-accent-2 p-3 text-sm leading-relaxed">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="border-2 border-ink bg-accent-3 p-3 text-sm font-bold">
            Setelan tersimpan di booth ini.
          </p>
        )}

        <div className="sticky bottom-0 flex flex-col gap-2 border-t-2 border-ink/15 bg-bg py-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || runtimeDown}
            className="flex min-h-12 items-center justify-center gap-2 border-2 border-ink bg-accent px-5 font-display text-base font-bold uppercase tracking-[-0.01em] shadow-hard transition-transform active:translate-y-[2px] disabled:opacity-50"
          >
            {busy ? (
              "Menyimpan..."
            ) : (
              <>
                <Save className="size-4" aria-hidden />
                Simpan setelan
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-12 items-center justify-center gap-2 border-2 border-ink bg-surface px-5 font-display text-base font-bold uppercase tracking-[-0.01em]"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
