"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/server/auth-actions";
import { updateCheckoutSettingsAction } from "@/server/branding-actions";

const initial: FormState = {};

type Props = {
  qrisExpiryMinutes: number | null;
  canWrite: boolean;
};

/**
 * CheckoutSettingsEditor — expiry QRIS owner-configurable (default 3 menit).
 * Selama QR hidup customer tidak bisa buat QR baru; hangus otomatis setelahnya
 * (docs/06 §6.3, anti double-payment).
 */
export function CheckoutSettingsEditor({ qrisExpiryMinutes, canWrite }: Props) {
  const [state, formAction, pending] = useActionState(updateCheckoutSettingsAction, initial);
  const [touched, setTouched] = useState(false);
  const [minutes, setMinutes] = useState(
    qrisExpiryMinutes !== null && qrisExpiryMinutes !== undefined ? String(qrisExpiryMinutes) : "3"
  );

  const fieldError = state.fieldErrors?.["qris_expiry_minutes"]?.[0];

  return (
    <form action={formAction} onSubmit={() => setTouched(true)} noValidate className="contents">
      <section
        className="border-2 border-ink bg-surface p-6 shadow-hard"
        aria-labelledby="checkout-settings-heading"
      >
        <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
          <h2
            id="checkout-settings-heading"
            className="font-display text-lg uppercase tracking-tight"
          >
            Pembayaran QRIS
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            03 / CHECKOUT
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="qris-expiry-minutes"
            className="font-mono text-xs uppercase tracking-[0.1em]"
          >
            Kedaluwarsa QR (menit)
          </label>
          <div className="flex max-w-[240px] items-center gap-3">
            <Input
              id="qris-expiry-minutes"
              name="qris_expiry_minutes"
              type="number"
              min={1}
              max={60}
              step={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              disabled={pending || !canWrite}
              aria-invalid={Boolean(fieldError)}
            />
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              menit
            </span>
          </div>
          {fieldError ? (
            <p role="alert" className="font-mono text-xs text-destructive">
              {fieldError}
            </p>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">
              Default 3 menit (rentang 1–60). QR hangus otomatis setelah waktu ini. Selama masih
              hidup, customer tidak bisa membuat QR baru.
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="mt-4 font-mono text-xs text-destructive">
            {state.error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-4">
          <Button type="submit" disabled={pending || !canWrite} className="bg-accent">
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
          {touched && state.error === undefined && state.fieldErrors === undefined && (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {"TERSIMPAN"}
            </p>
          )}
        </div>
      </section>
    </form>
  );
}
