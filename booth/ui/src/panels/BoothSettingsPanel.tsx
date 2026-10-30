import { useEffect, useState } from "react";

import { BridgeError, bridge, type SettingsResponse } from "../bridge";

type GroupKey = "camera_settings" | "print_settings" | "session_settings" | "appearance_settings";

type FieldSpec = {
  key: string;
  label: string;
  kind: "text" | "number" | "bool" | "select";
  options?: string[];
  step?: number;
};

/**
 * Field yang boleh ditulis device. Field cloud-owned (print copies/layout)
 * sengaja TIDAK ditampilkan: cloud menolaknya dengan 403 FIELD_NOT_DEVICE_OWNED.
 */
const GROUPS: { key: GroupKey; title: string; fields: FieldSpec[] }[] = [
  {
    key: "camera_settings",
    title: "Kamera",
    fields: [
      { key: "provider", label: "Provider", kind: "select", options: ["browser", "digicamcontrol", "gphoto2", "libcamera", "v4l2", "pyav", "bridge"] },
      { key: "countdown_seconds", label: "Hitung mundur (detik)", kind: "number", step: 1 },
      { key: "mirror_preview", label: "Cermin pratinjau", kind: "bool" },
      { key: "chroma_key_enabled", label: "Chroma key", kind: "bool" },
      { key: "capture_width", label: "Lebar tangkap", kind: "number", step: 1 },
      { key: "capture_height", label: "Tinggi tangkap", kind: "number", step: 1 },
      { key: "rotation_degrees", label: "Rotasi (0/90/180/270)", kind: "number", step: 90 },
      { key: "zoom", label: "Zoom", kind: "number", step: 0.1 },
    ],
  },
  {
    key: "print_settings",
    title: "Printer",
    fields: [
      { key: "enabled", label: "Cetak aktif", kind: "bool" },
      { key: "paper_size", label: "Ukuran kertas", kind: "select", options: ["4x6", "A6"] },
      { key: "orientation", label: "Orientasi", kind: "select", options: ["portrait", "landscape"] },
      { key: "auto_print", label: "Cetak otomatis", kind: "bool" },
      { key: "margins_mm", label: "Margin (mm)", kind: "number", step: 1 },
      { key: "mode", label: "Jalur cetak", kind: "select", options: ["browser", "bluetooth", "cups"] },
      { key: "printer_name", label: "Nama printer", kind: "text" },
    ],
  },
  {
    key: "session_settings",
    title: "Sesi",
    fields: [
      { key: "timer_seconds", label: "Durasi sesi (detik)", kind: "number", step: 10 },
      { key: "warning_seconds", label: "Peringatan (detik)", kind: "number", step: 10 },
      { key: "max_retakes", label: "Maks. ulang", kind: "number", step: 1 },
    ],
  },
  {
    key: "appearance_settings",
    title: "Tampilan (lokal booth ini)",
    fields: [
      { key: "bg_color", label: "Warna latar (#RRGGBB)", kind: "text" },
      { key: "text_color", label: "Warna teks (#RRGGBB)", kind: "text" },
      { key: "font_family", label: "Keluarga font", kind: "select", options: ["display", "sans", "mono"] },
      { key: "font_scale", label: "Skala font", kind: "number", step: 0.1 },
      { key: "align", label: "Perataan", kind: "select", options: ["left", "center", "right"] },
      { key: "welcome_title", label: "Judul sambutan", kind: "text" },
      { key: "welcome_tagline", label: "Tagline", kind: "text" },
      { key: "welcome_button", label: "Tombol sambutan", kind: "text" },
      { key: "show_logo", label: "Tampilkan logo", kind: "bool" },
      { key: "show_tagline", label: "Tampilkan tagline", kind: "bool" },
      { key: "allow_zoom_pan", label: "Izinkan zoom/geser", kind: "bool" },
    ],
  },
];

function toInputValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function fromInputValue(spec: FieldSpec, raw: string): unknown {
  if (raw === "") {
    return undefined;
  }
  if (spec.kind === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (spec.kind === "bool") {
    return raw === "true";
  }
  return raw;
}

export function BoothSettingsPanel({
  settings,
  onSaved,
}: {
  settings: SettingsResponse | null;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) {
      return;
    }
    const next: Record<string, Record<string, string>> = {};
    for (const group of GROUPS) {
      const groupDraft: Record<string, string> = {};
      for (const field of group.fields) {
        groupDraft[field.key] = toInputValue(settings.settings[group.key]?.[field.key]);
      }
      next[group.key] = groupDraft;
    }
    setDraft(next);
  }, [settings]);

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const payload: Record<string, Record<string, unknown>> = {};
      for (const group of GROUPS) {
        const groupPayload: Record<string, unknown> = {};
        for (const field of group.fields) {
          const value = fromInputValue(field, draft[group.key]?.[field.key] ?? "");
          if (value !== undefined) {
            groupPayload[field.key] = value;
          }
        }
        if (Object.keys(groupPayload).length > 0) {
          payload[group.key] = groupPayload;
        }
      }
      await bridge.writeSettings(payload);
      await onSaved();
      setMessage("Setelan tersimpan di mesin ini.");
    } catch (caught) {
      setError(caught instanceof BridgeError ? `${caught.message}${caught.code ? ` (${caught.code})` : ""}` : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <div className="empty">Menunggu setelan dari bridge…</div>;
  }

  return (
    <div>
      {message ? <div className="alert ok">{message}</div> : null}
      {error ? <div className="alert">{error}</div> : null}
      <div className="grid cols-2">
        {GROUPS.map((group) => (
          <div className="panel" key={group.key}>
            <h2>{group.title}</h2>
            {group.fields.map((field) => (
              <label key={field.key}>
                <span>{field.label}</span>
                {field.kind === "select" ? (
                  <select
                    value={draft[group.key]?.[field.key] ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        [group.key]: { ...prev[group.key], [field.key]: event.target.value },
                      }))
                    }
                  >
                    <option value="">(bawaan)</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.kind === "bool" ? (
                  <select
                    value={draft[group.key]?.[field.key] || ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        [group.key]: { ...prev[group.key], [field.key]: event.target.value },
                      }))
                    }
                  >
                    <option value="">(bawaan)</option>
                    <option value="true">Ya</option>
                    <option value="false">Tidak</option>
                  </select>
                ) : (
                  <input
                    type={field.kind === "number" ? "number" : "text"}
                    step={field.step}
                    value={draft[group.key]?.[field.key] ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        [group.key]: { ...prev[group.key], [field.key]: event.target.value },
                      }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Menyimpan…" : "Simpan Setelan"}
        </button>
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        Jumlah cetak (<strong>copies</strong>) dan tata letak (<strong>layout</strong>)
        milik cloud dan tidak bisa diubah dari booth.
      </p>
    </div>
  );
}
