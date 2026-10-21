"use client";

import { Delete } from "lucide-react";

/**
 * OnScreenKeyboard — papan ketik layar sentuh untuk kiosk (offline/voucher).
 * Dipakai saat kiosk tanpa keyboard fisik; huruf A–Z, angka 0–9, backspace.
 * ponytail: layout QWERTY penuh + geser-huruf-kecil tidak perlu — kode voucher
 * SnapyOS huruf besar + angka.
 */

const ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const keyClass =
  "min-h-11 flex-1 border-2 border-ink bg-surface font-display text-base font-bold uppercase leading-none tracking-[-0.01em] shadow-[2px_2px_0_0_#111111] transition-transform duration-150 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50";

export function OnScreenKeyboard({
  onKey,
  onBackspace,
  disabled,
}: {
  onKey(key: string): void;
  onBackspace(): void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="Papan ketik layar">
      {ROWS.map((row, i) => {
        // Baris terakhir (Z–M) punya 7 huruf; backspace mengisi lebar dua
        // tombol supaya total lebarnya sejajar baris A–L (9 satuan).
        const isLast = i === ROWS.length - 1;
        return (
          <div key={i} className="flex justify-center gap-1.5">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onKey(key)}
                className={keyClass}
              >
                {key}
              </button>
            ))}
            {isLast ? (
              <button
                type="button"
                aria-label="Hapus satu karakter"
                disabled={disabled}
                onClick={onBackspace}
                className={`${keyClass} flex-[2]`}
              >
                <Delete className="mx-auto size-5" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
