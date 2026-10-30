import { useState } from "react";

import type { StatusResponse } from "../bridge";

/**
 * Pairing booth. Alur kode-aktivasi cloud diimplementasikan pada Fase 4;
 * panel ini menyatakan status saat ini dan titik masuk operator, bukan
 * menyimpan kredensial di UI.
 */
export function PairingPanel({
  status,
  onPaired,
}: {
  status: StatusResponse | null;
  onPaired: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const paired = Boolean(status?.photobox_slug);

  async function submit() {
    setMessage(
      "Aktivasi cloud diaktifkan pada Fase 4. Masukkan kode dari dashboard owner " +
        "(Photobox → Aktivasi) setelah kanal lisensi tersedia."
    );
    await onPaired();
  }

  return (
    <div className="grid cols-2">
      <div className="panel">
        <h2>Status Pairing</h2>
        <dl className="meta">
          <dt>STATUS</dt>
          <dd>{paired ? "TERPAIRING" : "BELUM DI-PAIRING"}</dd>
          <dt>SLUG BISNIS</dt>
          <dd>{status?.business_slug ?? "—"}</dd>
          <dt>SLUG PHOTOBOX</dt>
          <dd>{status?.photobox_slug ?? "—"}</dd>
        </dl>
        <p className="note" style={{ marginTop: 12 }}>
          <strong>1 pairing = 1 aplikasi = 1 lisensi.</strong> Satu instalasi
          terikat ke satu photobox dan satu mesin. Memindahkan booth ke komputer
          lain memerlukan nonaktifkan perangkat lama lalu aktivasi baru.
        </p>
      </div>
      <div className="panel">
        <h2>Aktivasi</h2>
        <label>
          <span>Kode aktivasi</span>
          <input
            type="text"
            value={code}
            maxLength={12}
            placeholder="XXXXXX"
            onChange={(event) => setCode(event.target.value.toUpperCase().trim())}
          />
        </label>
        <div className="actions">
          <button type="button" className="btn primary" disabled={code.length < 4} onClick={() => void submit()}>
            Aktifkan
          </button>
        </div>
        {message ? (
          <div className="alert" style={{ marginTop: 12 }}>
            {message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
