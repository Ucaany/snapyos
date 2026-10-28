"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost, KioskError } from "@/components/kiosk/api";
import { KioskEyebrow, KioskHeading } from "@/components/kiosk/ui";

type Props = {
  initialCode: string | null;
  onActivated: (deviceToken: string) => void;
};

/** Sanitasi kode: hanya A-Z0-9 (anti spasi/karakter aneh dari input/URL). */
function sanitizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-bg px-6 py-10 text-center">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-7">
        <div className="flex flex-col items-center gap-3">
          <KeyRound className="size-9" aria-hidden />
          <KioskEyebrow>{"AKTIVASI PERANGKAT"}</KioskEyebrow>
          <KioskHeading size="md" className="max-w-[16ch]">
            Masukkan kode aktivasi
          </KioskHeading>
          <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
            Kode 6 karakter dari dashboard pemilik booth ini (menu Photobox, Perangkat). Perangkat
            hanya perlu diaktifkan sekali.
          </p>
        </div>

        <form
          className="flex w-full flex-col gap-4 border-2 border-ink bg-surface p-5 shadow-hard md:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
        >
          <div className="flex flex-col gap-2 text-left">
            <label
              htmlFor="activation-code"
              className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
            >
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
              className="h-14 text-center font-mono text-2xl uppercase tracking-[0.4em]"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "activation-error" : undefined}
            />
          </div>

          {error && (
            <p
              id="activation-error"
              role="alert"
              className="border-2 border-destructive bg-destructive/10 px-3 py-2 text-left text-xs font-bold uppercase leading-relaxed tracking-[0.04em]"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={pending || code.trim().length !== 6}
            className="min-h-14 bg-accent text-base"
          >
            {pending ? "Mengaktifkan..." : "Aktifkan"}
          </Button>
        </form>
      </div>
    </div>
  );
}
