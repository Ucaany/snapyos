"use client";

import { useEffect, useRef, useState } from "react";
import { Delete, Loader2, LockKeyhole } from "lucide-react";
import { apiPost, KioskError } from "@/components/kiosk/api";

type Props = {
  deviceToken: string | null;
  /** Dipanggil setelah PIN diverifikasi server — keluar TANPA reset sesi. */
  onSuccess: () => void;
  onCancel: () => void;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const keyBtn =
  "border-2 border-ink bg-bg py-4 font-display text-2xl uppercase tracking-tight shadow-[4px_4px_0_0_#111111] transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Dialog PIN keluar kiosk — petugas memasukkan PIN (diatur owner di dashboard
 * photobox) untuk keluar mode photobooth. State sesi TIDAK disentuh: keluar
 * hanya melepas fullscreen lock, tanpa reload/reset (sesi berjalan utuh dan
 * resume otomatis bila halaman dibuka ulang).
 */
export function ExitPinDialog({ deviceToken, onSuccess, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Nilai terbaru untuk listener keyboard global — tanpa ref, listener yang
  // dipasang sekali akan men-submit PIN dari render pertama (selalu kosong).
  const pinRef = useRef(pin);
  const submitRef = useRef<(value: string) => void>(() => undefined);

  // Fokus awal ke dialog + Escape untuk batal + Tab terkurung di dalam dialog
  // (R-32: modal keyboard-navigable, tidak bocor ke kontrol kiosk di belakang).
  useEffect(() => {
    const node = dialogRef.current;
    node?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      // Keyboard fisik booth mini PC: angka, Backspace, Enter.
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setError(null);
        setPin((prev) => (prev.length >= 8 ? prev : prev + e.key));
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setError(null);
        setPin((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void submitRef.current(pinRef.current);
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function submit(value: string) {
    if (busy || !deviceToken) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost<{ ok: boolean; pin_required: boolean }>("/api/v1/public/devices/exit", {
        device_token: deviceToken,
        ...(value ? { pin: value } : {}),
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof KioskError ? e.message : "Gagal memverifikasi PIN. Coba lagi.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  // Sinkronkan nilai terbaru ke listener keyboard setelah commit (bukan saat
  // render — React melarang menulis ref di fase render).
  useEffect(() => {
    submitRef.current = (value) => void submit(value);
    pinRef.current = pin;
  });

  function press(digit: string) {
    if (busy) return;
    setError(null);
    setPin((prev) => (prev.length >= 8 ? prev : prev + digit));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keluar mode kiosk"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex w-full max-w-[420px] flex-col gap-5 border-4 border-ink bg-bg p-6 shadow-[8px_8px_0_0_#111111] outline-none"
      >
        <div className="flex items-center gap-3">
          <LockKeyhole className="size-6 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-col">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              {"AKSES PETUGAS"}
            </p>
            <h2 className="font-display text-2xl uppercase leading-none tracking-tight">
              Keluar mode kiosk
            </h2>
          </div>
        </div>

        <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
          Masukkan PIN keluar yang diatur owner. Sesi foto yang sedang berjalan tidak terputus,
          kembali ke kiosk untuk melanjutkan.
        </p>

        {!deviceToken ? (
          <>
            <p
              role="alert"
              className="border-2 border-ink bg-accent px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.05em]"
            >
              Perangkat belum diaktivasi. Selesaikan aktivasi sebelum keluar kiosk.
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="self-center border-2 border-ink bg-surface px-5 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] shadow-[3px_3px_0_0_#111111] transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Kembali
            </button>
          </>
        ) : null}

        {/* Indikator digit PIN: nilai asli tidak ditampilkan */}
        <div className="flex justify-center gap-3" aria-live="polite">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span
              key={i}
              className={`size-5 border-2 border-ink ${i < pin.length ? "bg-ink" : "bg-surface"}`}
              aria-hidden
            />
          ))}
        </div>

        {error && (
          <p
            role="alert"
            className="border-2 border-ink bg-accent px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.05em]"
          >
            {error}
          </p>
        )}

        {deviceToken && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {KEYS.map((k) => (
                <button key={k} type="button" onClick={() => press(k)} className={keyBtn}>
                  {k}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPin((prev) => prev.slice(0, -1));
                }}
                aria-label="Hapus satu digit"
                className={keyBtn}
              >
                <Delete className="mx-auto size-6" aria-hidden />
              </button>
              <button type="button" onClick={() => press("0")} className={keyBtn}>
                0
              </button>
              <button
                type="button"
                onClick={() => void submit(pin)}
                disabled={busy || pin.length < 4}
                className="border-2 border-ink bg-accent py-4 font-display text-lg uppercase tracking-tight shadow-[4px_4px_0_0_#111111] transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 disabled:shadow-none disabled:active:translate-y-0"
              >
                {busy ? <Loader2 className="mx-auto size-6 animate-spin" aria-hidden /> : "Keluar"}
              </button>
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {"KEYBOARD: ANGKA · BACKSPACE · ENTER"}
            </p>

            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="self-center border-2 border-ink bg-surface px-5 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] shadow-[3px_3px_0_0_#111111] transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              Batal. Kembali ke kiosk
            </button>
          </>
        )}
      </div>
    </div>
  );
}
