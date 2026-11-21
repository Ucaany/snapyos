"use client";

import { useState } from "react";
import { Banknote, Landmark, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { formatIDR } from "@/lib/dashboard-math";
import { posCashChange } from "@/lib/pos-math";

/**
 * PayMethodDialog — pilih metode pembayaran offline (docs/pos/03 §5.3).
 * Pakai primitif base-ui Dialog (sama pola ui/dialog.tsx) supaya focus trap,
 * restore fokus ke pemicu, aria-modal, dan Escape ditangani runtime — bukan
 * hand-rolled. Dipasang hanya saat order pending, jadi selalu terbuka.
 *
 * Uang tunai: kasir boleh mengisi uang diterima untuk menghitung kembalian.
 * Kembalian di sini HANYA tampilan; server menghitung ulang (A8).
 */
export function PayMethodDialog({
  orderNumber,
  finalAmount,
  busy,
  error,
  onPay,
  onCancel,
}: {
  orderNumber: string;
  finalAmount: number;
  busy: boolean;
  error?: string | null;
  onPay: (
    method: "cash" | "bank_transfer" | "other",
    amountReceived?: number
  ) => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}) {
  const [raw, setRaw] = useState("");
  const amountReceived = raw === "" ? null : Number(raw);
  const change = posCashChange(finalAmount, amountReceived);
  const short = amountReceived !== null && change !== null && change < 0;

  const quick = [
    { label: "UANG PAS", value: finalAmount },
    { label: "50.000", value: 50_000 },
    { label: "100.000", value: 100_000 },
  ];

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) void onCancel();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-ink/40" />
        <DialogPrimitive.Popup
          aria-label="Pilih metode pembayaran"
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 border-2 border-ink bg-surface p-6 shadow-[8px_8px_0_0_#111111] outline-none"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">{"Pembayaran"}</p>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Order {orderNumber}
          </p>
          <p className="mt-1 font-display text-4xl uppercase tracking-tight">
            {formatIDR(finalAmount)}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Terima pembayaran dari customer, lalu pilih metode:
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-[10px] font-bold uppercase leading-relaxed tracking-[0.08em] text-ink"
            >
              {error}
            </p>
          )}

          <div className="mt-5 border-2 border-ink p-3">
            <label
              htmlFor="pos-amount-received"
              className="block font-mono text-[10px] font-bold uppercase tracking-[0.15em]"
            >
              Uang diterima
            </label>
            <Input
              id="pos-amount-received"
              inputMode="numeric"
              autoComplete="off"
              placeholder={String(finalAmount)}
              value={raw}
              disabled={busy}
              aria-invalid={short}
              className="mt-2 font-mono text-lg tabular-nums"
              onChange={(event) => setRaw(event.target.value.replace(/\D/g, "").slice(0, 10))}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {quick.map((q) => (
                <Button
                  key={q.label}
                  type="button"
                  size="sm"
                  variant="neutral"
                  disabled={busy || q.value < finalAmount}
                  onClick={() => setRaw(String(q.value))}
                >
                  {q.label}
                </Button>
              ))}
            </div>

            <div
              aria-live="polite"
              className="mt-3 flex items-baseline justify-between border-t-2 border-ink/10 pt-3"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Kembalian
              </span>
              <span
                className={
                  short
                    ? "font-display text-3xl font-bold uppercase text-destructive"
                    : "font-display text-3xl font-bold uppercase"
                }
              >
                {change === null
                  ? "—"
                  : short
                    ? `KURANG ${formatIDR(Math.abs(change))}`
                    : formatIDR(change)}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <Button
              size="lg"
              disabled={busy || short}
              onClick={() => void onPay("cash", amountReceived ?? undefined)}
            >
              <Banknote aria-hidden />
              {busy ? "Memproses…" : "Tunai"}
            </Button>
            <Button
              size="lg"
              variant="neutral"
              disabled={busy}
              onClick={() => void onPay("bank_transfer")}
            >
              <Landmark aria-hidden />
              Transfer bank
            </Button>
            <Button
              size="lg"
              variant="neutral"
              disabled={busy}
              onClick={() => void onPay("other")}
            >
              <Package aria-hidden />
              Lainnya
            </Button>
          </div>

          <div className="mt-4 border-t-2 border-ink/10 pt-4">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void onCancel()}
              className="w-full"
            >
              Batalkan order
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
