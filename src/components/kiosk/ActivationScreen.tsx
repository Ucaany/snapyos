"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost, KioskError } from "@/components/kiosk/api";

type Props = {
  initialCode: string | null;
  onActivated: (deviceToken: string) => void;
};

/** Sanitasi kode: hanya A-Z0-9 (anti spasi/karakter aneh dari input/URL). */
function sanitizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/** Activation Screen — docs/05 §5.0 (masukkan kode / scan QR via ?code=). */
export function ActivationScreen({ initialCode, onActivated }: Props) {
  const [code, setCode] = useState(initialCode ? sanitizeCode(initialCode) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Guard sinkron anti double-submit: state `pending` belum ter-flush saat klik
  // kedua di frame yang sama, jadi ref ini yang menahan duplicate request.
  const inFlightRef = useRef(false);

  async function submit(value: string) {
    const trimmed = value.trim().toUpperCase();
    if (trimmed.length !== 6 || inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const data = await apiPost<{ device_token: string }>("/api/v1/public/devices/activate", {
        code: trimmed,
      });
      if (!data?.device_token) throw new Error("Respons aktivasi tidak valid");
      onActivated(data.device_token);
    } catch (e) {
      setError(e instanceof KioskError ? e.message : "Terjadi kesalahan. Coba lagi.");
      setPending(false);
      inFlightRef.current = false;
    }
  }

  useEffect(() => {
    const sanitized = initialCode ? sanitizeCode(initialCode) : "";
    if (sanitized.length !== 6) return;
    const t = setTimeout(() => void submit(sanitized), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto bg-bg px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <KeyRound className="size-12" aria-hidden />
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {"/// AKTIVASI PERANGKAT"}
        </p>
        <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-tight md:text-6xl">
          Masukkan kode aktivasi
        </h1>
        <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
           Kode 6 karakter dari dashboard pemilik booth ini (menu Photobox, Perangkat).
          Perangkat hanya perlu diaktifkan sekali.
        </p>
      </div>

      <form
        className="flex w-full max-w-[360px] flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="activation-code" className="font-mono text-xs uppercase tracking-[0.1em]">
            Kode aktivasi
          </label>
          <Input
            id="activation-code"
            value={code}
            onChange={(e) => {
              setCode(sanitizeCode(e.target.value));
              if (error) setError(null);
            }}
            placeholder="ABCD23"
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            disabled={pending}
            className="text-center font-mono text-2xl uppercase tracking-[0.4em]"
            aria-invalid={Boolean(error)}
          />
        </div>

        {error && (
          <p role="alert" className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending || code.trim().length !== 6} className="bg-accent">
           {pending ? "Mengaktifkan..." : "Aktifkan"}
        </Button>
      </form>
    </div>
  );
}
