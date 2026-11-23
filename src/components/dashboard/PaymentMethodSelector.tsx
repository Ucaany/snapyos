"use client";

import { PAYMENT_METHODS } from "@/lib/payment-credentials";
import type { GatewayProvider } from "@/server/payment/providers/types";

type Props = {
  provider: GatewayProvider;
  selected: string[];
  disabled?: boolean;
  onChange?(next: string[]): void;
};

const providerHints: Record<GatewayProvider, string> = {
  midtrans: "QRIS, e-wallet redirect, dan Virtual Account bank transfer.",
  tripay: "QRIS, gerai retail, dan Virtual Account (closed payment).",
};

/**
 * PaymentMethodSelector — check metode enabled per provider dari `PAYMENT_METHODS`.
 * Controlled: state pemilik form yang menyimpan ke `metadata.enabled_methods`.
 * Backend `assertEnabledPaymentMethods` tetap penjaga final (minimal satu valid).
 */
export function PaymentMethodSelector({ provider, selected, disabled, onChange }: Props) {
  const methods = PAYMENT_METHODS[provider];
  const toggle = (method: string, checked: boolean) => {
    if (!onChange) return;
    onChange(
      checked ? [...new Set([...selected, method])] : selected.filter((item) => item !== method)
    );
  };

  return (
    <fieldset disabled={disabled} className="border-2 border-ink bg-muted p-3">
      <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
        [ METODE TERSEDIA ] MIN. 1
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {methods.map((method) => (
          <label
            key={method}
            className="flex min-h-11 items-center gap-2 border-2 border-ink bg-surface px-2 font-mono text-[10px] uppercase tracking-[0.06em]"
          >
            <input
              name="enabled_methods"
              type="checkbox"
              value={method}
              checked={selected.includes(method)}
              onChange={(event) => toggle(method, event.target.checked)}
              className="size-4 accent-ink"
            />
            {method}
          </label>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {providerHints[provider]}
      </p>
    </fieldset>
  );
}
