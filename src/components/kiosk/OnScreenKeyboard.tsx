"use client";

import { Delete } from "lucide-react";
import { KIOSK_PAD_KEY } from "@/components/kiosk/ui";

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
    <div className="flex flex-col gap-2" role="group" aria-label="Papan ketik layar">
      {ROWS.map((row, i) => {
        // Baris terakhir (Z–M) punya 7 huruf; backspace mengisi lebar dua
        // tombol. flex-wrap + min-w-11 menjamin setiap tombol tetap ≥44px
        // walau viewport menyempit (360px) — tombol pindah ke baris berikutnya.
        const isLast = i === ROWS.length - 1;
        return (
          <div key={i} className="flex flex-wrap justify-center gap-2">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onKey(key)}
                className={KIOSK_PAD_KEY}
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
                className={`${KIOSK_PAD_KEY} flex-[2]`}
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
