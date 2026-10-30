import { useCallback, useEffect, useMemo, useState } from "react";

import { BridgeError, bridge, type SettingsResponse, type StatusResponse } from "./bridge";
import { BoothSettingsPanel } from "./panels/BoothSettingsPanel";
import { ImportExportPanel } from "./panels/ImportExportPanel";
import { PairingPanel } from "./panels/PairingPanel";

type Tab = "kiosk" | "settings" | "pair" | "transfer";

const TABS: { id: Tab; label: string }[] = [
  { id: "kiosk", label: "Kiosk" },
  { id: "settings", label: "Setelan Booth" },
  { id: "pair", label: "Pairing" },
  { id: "transfer", label: "Import / Export" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("kiosk");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextSettings] = await Promise.all([bridge.status(), bridge.readSettings()]);
      setStatus(nextStatus);
      setSettings(nextSettings);
      setError(null);
    } catch (caught) {
      setError(caught instanceof BridgeError ? caught.message : "Bridge tidak bisa dihubungi.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const paired = useMemo(() => Boolean(status?.photobox_slug), [status]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <span className="brand-mark">///</span> SNAPY OS <span className="framing">BOOTH</span>
        </h1>
        <nav className="nav" aria-label="Navigasi utama">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="note">
          {status ? `v${status.version} · DB ${status.db_version}` : "menghubungkan…"}
        </span>
      </header>

      <main className="main">
        {error ? <div className="alert">{error}</div> : null}
        {!paired && status ? (
          <div className="alert">
            Booth belum di-pairing. Buka tab <strong>PAIRING</strong> untuk mengaktifkan.
          </div>
        ) : null}

        {tab === "kiosk" ? <KioskPanel status={status} /> : null}
        {tab === "settings" ? <BoothSettingsPanel settings={settings} onSaved={refresh} /> : null}
        {tab === "pair" ? <PairingPanel status={status} onPaired={refresh} /> : null}
        {tab === "transfer" ? <ImportExportPanel onImported={refresh} /> : null}
      </main>

      <footer className="bottombar">
        <span className="note">
          KAMERA <StatusDot ok={status?.camera.connected ?? false} /> {status?.camera.adapter ?? "—"}
          {status?.camera.mock ? " (MOCK)" : ""}
        </span>
        <span className="note">
          PRINTER <StatusDot ok={status?.printer.ok ?? false} /> {status?.printer.adapter ?? "—"}
          {status?.printer.mock ? " (MOCK)" : ""}
        </span>
        <span className="note">{status?.photobox_slug ?? "BELUM DI-PAIRING"}</span>
      </footer>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`status-dot${ok ? " ok" : ""}`} aria-hidden="true" />;
}

function KioskPanel({ status }: { status: StatusResponse | null }) {
  return (
    <section className="grid cols-2">
      <div className="panel">
        <h2>Status Mesin</h2>
        <dl className="meta">
          <dt>VERSI APLIKASI</dt>
          <dd>{status?.version ?? "—"}</dd>
          <dt>DIREKTORI DATA</dt>
          <dd>{status?.data_dir ?? "—"}</dd>
          <dt>SLUG BISNIS</dt>
          <dd>{status?.business_slug ?? "—"}</dd>
          <dt>SLUG PHOTOBOX</dt>
          <dd>{status?.photobox_slug ?? "BELUM DI-PAIRING"}</dd>
        </dl>
      </div>
      <div className="panel">
        <h2>Permukaan Bridge</h2>
        <p className="note">
          Kiosk pelanggan dimuat pada jendela penuh. Antarmuka ini menyajikan
          status perangkat dan pintu setelan; keduanya berjalan lokal di dalam
          aplikasi, bukan dari halaman cloud.
        </p>
        <p className="note">
          <strong>1 pairing = 1 booth.</strong> Setelan tampilan, kamera, dan
          printer hanya berlaku di mesin ini.
        </p>
      </div>
    </section>
  );
}
