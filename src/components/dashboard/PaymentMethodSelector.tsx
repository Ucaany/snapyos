"use client";

import { PAYMENT_METHODS } from "@/lib/payment-credentials";
import type { GatewayProvider } from "@/server/payment/providers/types";

type Props = {
  provider: GatewayProvider;
  selected: string[];
  disabled?: boolean;
};

const providerHints: Record<GatewayProvider, string> = {
  pakasir: "QRIS hanya (project merchant personal).",
  midtrans: "QRIS, redirect, dan Virtual Account bank transfer.",
  tripay: "QRIS, payment channel, dan Virtual Account.",
};

/**
 * PaymentMethodSelector — check metode enabled per provider.
 * Backend `allowedPaymentMethods` tetap filter final (frontend hanya tampilan).
 */
export function PaymentMethodSelector({ provider, selected, disabled }: Props) {
  const methods = PAYMENT_METHODS[provider];
  return (
    <fieldset disabled={disabled} className="border-2 border-ink bg-muted p-3">
      <legend className="px-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
        [ METODE TERSEDIA ]
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
              defaultChecked={selected.includes(method)}
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
