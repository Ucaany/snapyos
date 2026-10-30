import { useState } from "react";

import { BridgeError, bridge } from "../bridge";

/**
 * Import/export setelan lewat berkas. Envelope & aturan penolakan sama dengan
 * `GET /v1/settings/export` dan `POST /v1/settings/import` runtime: berkas tidak
 * pernah memuat kunci `exit_pin_*`, dan berkas milik booth lain ditolak.
 */
export function ImportExportPanel({ onImported }: { onImported: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doExport() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const payload = await bridge.exportSettings();
      const pretty = JSON.stringify(payload, null, 2);
      setText(pretty);
      const blob = new Blob([pretty], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const slug = (payload as { photobox_slug?: string }).photobox_slug ?? "booth";
      anchor.href = url;
      anchor.download = `snapyos-settings-${slug}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Berkas setelan diekspor.");
    } catch (caught) {
      setError(caught instanceof BridgeError ? caught.message : "Gagal mengekspor.");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const payload: unknown = JSON.parse(text);
      await bridge.importSettings(payload);
      await onImported();
      setMessage("Setelan dari berkas diterapkan.");
    } catch (caught) {
      if (caught instanceof BridgeError) {
        setError(`${caught.message}${caught.code ? ` (${caught.code})` : ""}`);
      } else {
        setError("Berkas bukan JSON yang valid.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid cols-2">
      <div className="panel">
        <h2>Ekspor</h2>
        <p className="note">
          Menghasilkan berkas setelan booth (tanpa PIN darurat). Berkas memuat
          <strong> schema_version</strong> dan <strong>photobox_slug</strong>;
          impor akan menolak berkas milik booth lain.
        </p>
        <div className="actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void doExport()}>
            Ekspor ke Berkas
          </button>
        </div>
      </div>
      <div className="panel">
        <h2>Impor</h2>
        <textarea
          rows={12}
          style={{ width: "100%" }}
          value={text}
          placeholder='{"schema_version":1,"photobox_slug":"booth-01","settings":{…}}'
          onChange={(event) => setText(event.target.value)}
        />
        <div className="actions">
          <button type="button" className="btn primary" disabled={busy || text.trim().length === 0} onClick={() => void doImport()}>
            Terapkan dari Teks
          </button>
        </div>
      </div>
      {message ? <div className="alert ok" style={{ gridColumn: "1 / -1" }}>{message}</div> : null}
      {error ? <div className="alert" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
    </div>
  );
}
