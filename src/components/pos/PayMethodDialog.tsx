"use client";

import { Banknote, Landmark, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { formatIDR } from "@/lib/dashboard-math";

/**
 * PayMethodDialog — pilih metode pembayaran offline (docs/pos/03 §5.3).
 * Pakai primitif base-ui Dialog (sama pola ui/dialog.tsx) supaya focus trap,
 * restore fokus ke pemicu, aria-modal, dan Escape ditangani runtime — bukan
 * hand-rolled. Dipasang hanya saat order pending, jadi selalu terbuka.
 */
export function PayMethodDialog({
  orderNumber,
  finalAmount,
  busy,
  onPay,
  onCancel,
}: {
  orderNumber: string;
  finalAmount: number;
  busy: boolean;
  onPay: (method: "cash" | "bank_transfer" | "other") => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}) {
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

          <div className="mt-6 flex flex-col gap-3">
            <Button size="lg" disabled={busy} onClick={() => void onPay("cash")}>
              <Banknote aria-hidden />
              {busy ? "Memproses…" : "Tunai"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={busy}
              onClick={() => void onPay("bank_transfer")}
            >
              <Landmark aria-hidden />
              Transfer bank
            </Button>
            <Button
              size="lg"
              variant="secondary"
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
