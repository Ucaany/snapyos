import { useState, type FormEvent } from "react";

import {
  BridgeError,
  bridge,
  bridgeCaptureSize,
  bridgeTokenMissing,
  bridgeTokenWeak,
  type StatusResponse,
} from "../bridge";

type Appearance = Record<string, unknown>;

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * Permukaan kiosk pelanggan: layar penuh tanpa topbar/tab operator.
 *
 * Keluar HANYA lewat PIN darurat (`POST /v1/exit`). Server memverifikasi PIN,
 * menegakkan lockout 5 menit, dan mencatat event; Shell lalu membuka kunci
 * jendela. UI tidak pernah memutuskan sendiri bahwa kiosk boleh ditutup.
 */
export function KioskSurface({
  status,
  appearance,
  onExit,
  onRefresh,
}: {
  status: StatusResponse | null;
  appearance: Appearance;
  onExit: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const title = asText(appearance.welcome_title, "SELAMAT DATANG");
  const tagline = asText(appearance.welcome_tagline, "Booth ini siap melayani foto Anda.");
  const ctaLabel = asText(appearance.welcome_button, "PERIKSA KESIAPAN");
  const showTagline = appearance.show_tagline !== false;
  const showLogo = appearance.show_logo !== false;
  const mock = Boolean(status?.camera.mock || status?.printer.mock);

  async function runCheck() {
    setBusy(true);
    setResult(null);
    try {
      const bytes = await bridgeCaptureSize();
      await onRefresh();
      setResult({ ok: true, text: `Kamera merespons (${bytes} byte frame). Booth siap.` });
    } catch (caught) {
      setResult({
        ok: false,
        text:
          caught instanceof BridgeError
            ? `${caught.message}${caught.code ? ` (${caught.code})` : ""}`
            : "Kamera tidak merespons. Panggil petugas.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(event: FormEvent) {
    event.preventDefault();
    setPinBusy(true);
    setPinError(null);
    try {
      await bridge.exit(pin.trim());
      setPin("");
      setPinOpen(false);
      onExit();
    } catch (caught) {
      setPinError(
        caught instanceof BridgeError
          ? `${caught.message}${caught.code ? ` (${caught.code})` : ""}`
          : "PIN tidak bisa diverifikasi."
      );
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        {showLogo ? <span className="kiosk-logo">/// SNAPY OS</span> : null}
        <span className="kiosk-slug">{status?.photobox_slug ?? "BOOTH BELUM DI-PAIRING"}</span>
        {mock ? <span className="kiosk-mock">MODE MOCK — BUKAN UNTUK PELANGGAN</span> : null}
      </header>

      {bridgeTokenMissing() || bridgeTokenWeak() ? (
        <div className="kiosk-warn">
          {bridgeTokenMissing()
            ? "Token bridge tidak diterima UI. Booth tidak bisa memanggil perangkat."
            : "Token bridge lemah (pendek atau berulang). Ganti sebelum dipakai melayani pelanggan."}
        </div>
      ) : null}

      <main className="kiosk-body">
        <p className="kiosk-eyebrow">PHOTOBOOTH</p>
        <h1 className="kiosk-title">{title}</h1>
        {showTagline ? <p className="kiosk-tagline">{tagline}</p> : null}

        <button type="button" className="kiosk-cta" disabled={busy} onClick={() => void runCheck()}>
          {busy ? "MEMERIKSA…" : ctaLabel}
        </button>

        {result ? (
          <p className={`kiosk-result${result.ok ? " ok" : ""}`}>{result.text}</p>
        ) : (
          <p className="kiosk-result">
            Tekan tombol untuk menguji kamera dan kesiapan booth sebelum menerima pelanggan.
          </p>
        )}
      </main>

      <footer className="kiosk-foot">
        <div className="kiosk-ready">
          <span>
            KAMERA <Dot ok={status?.camera.connected ?? false} /> {status?.camera.adapter ?? "—"}
          </span>
          <span>
            PRINTER <Dot ok={status?.printer.ok ?? false} /> {status?.printer.adapter ?? "—"}
          </span>
          <span>BRIDGE v{status?.version ?? "—"}</span>
        </div>
        <button type="button" className="kiosk-staff" onClick={() => setPinOpen(true)}>
          PETUGAS
        </button>
      </footer>

      {pinOpen ? (
        <div className="kiosk-overlay" role="dialog" aria-modal="true" aria-label="PIN darurat">
          <form className="kiosk-pin" onSubmit={(event) => void submitPin(event)}>
            <h2>PIN DARURAT</h2>
            <p className="note">
              Hanya untuk petugas. Lima PIN salah mengunci pintu keluar selama 5 menit.
            </p>
            <label>
              <span>PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                maxLength={32}
                autoFocus
                onChange={(event) => setPin(event.target.value)}
              />
            </label>
            {pinError ? <div className="alert">{pinError}</div> : null}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setPinOpen(false)}>
                Batal
              </button>
              <button type="submit" className="btn primary" disabled={pinBusy || pin.trim().length === 0}>
                {pinBusy ? "Memeriksa…" : "Buka Kunci"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={`status-dot${ok ? " ok" : ""}`} aria-hidden="true" />;
}
