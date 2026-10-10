"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AddOnCard, PlanCard } from "@/server/subscription";

/**
 * Lazy-mount checkout modal — chunk `SubscriptionCheckout` hanya difetch
 * setelah trigger diklik pertama kali (`hasOpened` gate). Bundle awal
 * `/dashboard/subscription` bebas dari kode modal (state, promo preview,
 * form breakdown). Pola `next/dynamic` sengaja diperkenalkan di sini
 * meski belum ada di dashboard lain: RSC page `subscription/page.tsx`
 * kini pure server, checkout hanya diaktifkan on-demand.
 */
const SubscriptionCheckout = dynamic(
  () => import("./SubscriptionCheckout").then((m) => m.SubscriptionCheckout),
  {
    ssr: false,
    loading: () => (
      <span
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink/60"
      >
        <span className="flex items-center gap-2 border-2 border-ink bg-surface px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-ink shadow-[4px_4px_0_0_#111111]">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Memuat checkout…
        </span>
      </span>
    ),
  }
);

type TriggerVariant = "default" | "secondary" | "outline" | "destructive" | "ghost" | "link";
type TriggerSize = "default" | "sm" | "lg" | "icon" | "icon-sm";

type Props = {
  plans: PlanCard[];
  addOns: AddOnCard[];
  currentPlanCode: string | null;
  defaultPlanCode: string;
  defaultAddOnId?: string;
  canWrite: boolean;
  label: ReactNode;
  variant?: TriggerVariant;
  size?: TriggerSize;
  className?: string;
  disabled?: boolean;
  recovery?: boolean;
};

export function SubscriptionCheckoutTrigger({
  plans,
  addOns,
  currentPlanCode,
  defaultPlanCode,
  defaultAddOnId,
  canWrite,
  label,
  variant = "default",
  size = "default",
  className,
  disabled = false,
  recovery = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={!canWrite || disabled}
        onClick={() => {
          setHasOpened(true);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      {hasOpened ? (
        <SubscriptionCheckout
          plans={plans}
          addOns={addOns}
          currentPlanCode={currentPlanCode}
          initialPlanCode={defaultPlanCode}
          initialAddOnId={defaultAddOnId}
          recovery={recovery}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
