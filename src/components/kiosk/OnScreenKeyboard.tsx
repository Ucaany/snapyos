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
    <div className="flex flex-col gap-1">
      {ROWS.map((row, i) => (
        <div key={i} className="flex justify-center gap-1">
          {i === ROWS.length - 1 ? (
            <button
              type="button"
              aria-label="Hapus satu karakter"
              disabled={disabled}
              onClick={onBackspace}
              className="flex h-12 flex-1 items-center justify-center border-2 border-ink bg-surface font-display text-lg uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              <Delete className="size-5" aria-hidden />
            </button>
          ) : null}
          {row.map((key) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onKey(key)}
              className="h-12 flex-1 border-2 border-ink bg-surface font-display text-lg uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
