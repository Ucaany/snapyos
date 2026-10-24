"use client";

import { useState } from "react";
import { getBridgeToken, setBridgeToken } from "@/lib/bridge-token";

/**
 * Isian token bridge lokal. Disimpan di localStorage perangkat kiosk, bukan di
 * database: bridge menguasai kamera dan printer, jadi token tidak boleh
 * dibaca browser siapa pun yang membuka halaman booth.
 */
export function BridgeTokenField({ onSaved }: { onSaved?: () => void }) {
  // Lazy init: komponen hanya dirender di klien (SetupWizard), jadi nilai awal
  // bisa langsung dibaca tanpa effect yang memicu render kedua.
  const [value, setValue] = useState(getBridgeToken);
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="bridge-token"
        className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
      >
        Token bridge
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="bridge-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          placeholder="PHOTOBOOTH_BRIDGE_TOKEN"
          className="min-h-11 flex-1 border-2 border-ink bg-surface px-3 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => {
            setBridgeToken(value);
            setSaved(true);
            onSaved?.();
          }}
          className="min-h-11 border-2 border-ink bg-accent px-4 font-mono text-xs font-bold uppercase tracking-[0.08em]"
        >
          Simpan token
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Nilai yang sama dengan <code>PHOTOBOOTH_BRIDGE_TOKEN</code> pada service bridge di komputer
        ini. Tanpa token, kamera DSLR dan cetak CUPS ditolak.
      </p>
      {saved && (
        <p role="status" className="font-mono text-xs font-bold uppercase">
          Token tersimpan di perangkat ini
        </p>
      )}
    </div>
  );
}
