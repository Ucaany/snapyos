"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Minus, Plus, TicketPercent } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatIDR } from "@/lib/dashboard-math";
import { cycleUnit, normalizeCycle } from "@/lib/subscription-math";
import type { AddOnCard, PlanCard } from "@/server/subscription";
import {
  confirmSubscriptionCheckoutAction,
  previewSubscriptionPromoAction,
} from "@/server/subscription-actions";

type Props = {
  plans: PlanCard[];
  addOns: AddOnCard[];
  currentPlanCode: string | null;
  initialPlanCode: string;
  initialAddOnId?: string;
  open: boolean;
  onClose: () => void;
  recovery?: boolean;
  renewal?: boolean;
  currentBillingCycle?: string;
};

/**
 * Layar konfirmasi checkout subscription — plan + add-on (qty custom) +
 * promo code → HARGA FIX → konfirmasi → invoice terbit → redirect ke
 * halaman pembayaran (QRIS dibuat hanya setelah user menekan Bayar).
 * Total pratinjau dihitung client; server selalu menghitung ulang.
 */
export function SubscriptionCheckout({
  plans,
  addOns,
  currentPlanCode,
  initialPlanCode,
  initialAddOnId,
  open,
  onClose,
  recovery = false,
  renewal = false,
  currentBillingCycle,
}: Props) {
  const router = useRouter();
  const [planCode, setPlanCode] = useState(initialPlanCode);
  const [qtyById, setQtyById] = useState<Record<string, number>>(
    initialAddOnId ? { [initialAddOnId]: 1 } : {}
  );
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = plans.find((p) => p.code === planCode) ?? null;
  // Plan awal bisa tidak ada di daftar (admin menonaktifkannya). Jangan kirim
  // planCode yang tidak dikenal dan jangan tampilkan total 0 yang menyesatkan.
  const planMissing = !plan;
  const confirmPlanCode = plan ? planCode : undefined;
  // Recovery (expired) / renewal (past_due): plan lama dianggap "plan change" —
  // server selalu menerbitkan plan_change item (periode baru), preview harga
  // harus match.
  const isActualPlanChange = recovery || renewal || planCode !== currentPlanCode;
  // Add-on-only memakai snapshot siklus subscription; plan change memakai
  // siklus plan tujuan (sama dengan logika server).
  const targetCycle = isActualPlanChange
    ? normalizeCycle(plan?.billingCycle)
    : normalizeCycle(currentBillingCycle ?? plan?.billingCycle);
  const unit = cycleUnit(targetCycle);

  // Add-on hanya yang punya harga pada siklus billing target.
  const availableAddOns = addOns.filter((a) => a.prices[targetCycle] !== null);
  const addOnLines = availableAddOns
    .map((a) => ({ addOn: a, qty: qtyById[a.id] ?? 0, price: a.prices[targetCycle] ?? 0 }))
    .filter((l) => l.qty > 0);
  // Match server logic: plan price only charged on actual plan change.
  const gross =
    (isActualPlanChange ? (plan?.price ?? 0) : 0) +
    addOnLines.reduce((s, l) => s + l.price * l.qty, 0);
  const total = Math.max(0, gross - (promo?.discount ?? 0));
  // Tanpa plan dikenal, checkout hanya boleh lanjut bila ada add-on (add-on
  // saja memakai plan aktif di server).
  const canConfirm = Boolean(plan) || addOnLines.length > 0;
  const totalLabel = planMissing && addOnLines.length === 0 ? "—" : formatIDR(total);

  function setQty(id: string, qty: number) {
    setQtyById((prev) => {
      const next = { ...prev };
      // Add-on `feature` (POS) biner — maksimum 1.
      const cap = addOns.find((a) => a.id === id)?.unit === "feature" ? 1 : 99;
      const q = Math.max(0, Math.min(cap, Math.floor(qty) || 0));
      if (q === 0) delete next[id];
      else next[id] = q;
      return next;
    });
    // Komposisi berubah → diskon promo lama tidak tentu valid, reset.
    setPromo(null);
    setPromoError(null);
  }

  async function applyPromo() {
    if (promoBusy) return;
    setPromoBusy(true);
    setPromoError(null);
    setPromo(null);
    try {
      const res = await previewSubscriptionPromoAction(promoInput, gross);
      if (res.error || res.discount === undefined) {
        setPromoError(res.error ?? "Promo tidak valid.");
        return;
      }
      setPromo({ code: res.code ?? promoInput.toUpperCase(), discount: res.discount });
    } catch {
      setPromoError("Gagal memeriksa promo. Coba lagi.");
    } finally {
      setPromoBusy(false);
    }
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmSubscriptionCheckoutAction({
        planCode: confirmPlanCode,
        addOns: addOnLines.map((l) => ({ id: l.addOn.id, qty: l.qty })),
        promoCode: promo?.code,
      });
      if (res.error || !res.invoiceId) {
        setError(res.error ?? "Checkout gagal. Coba lagi.");
        return;
      }
      router.push(`/dashboard/subscription/invoice/${res.invoiceId}`);
    } catch {
      setError("Checkout gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle>Konfirmasi checkout: harga fix setelah Anda konfirmasi</DialogTitle>
        <DialogDescription className="sr-only">
          Preview harga langganan sebelum bayar
        </DialogDescription>

        <div className="flex flex-col gap-5">
          {error && (
            <p
              role="alert"
              className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] text-destructive"
            >
              {error}
            </p>
          )}

          <section>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {"01. PLAN"}
            </p>
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant={p.code === planCode ? "default" : "neutral"}
                  size="sm"
                  onClick={() => {
                    setPlanCode(p.code);
                    const nextCycle =
                      p.code === currentPlanCode && !recovery && !renewal
                        ? normalizeCycle(currentBillingCycle ?? p.billingCycle)
                        : normalizeCycle(p.billingCycle);
                    setQtyById((prev) =>
                      Object.fromEntries(
                        Object.entries(prev).filter(
                          ([id, qty]) =>
                            qty > 0 &&
                            (addOns.find((a) => a.id === id)?.prices[nextCycle] ?? null) !== null
                        )
                      )
                    );
                    setPromo(null);
                    setPromoError(null);
                  }}
                  aria-pressed={p.code === planCode}
                >
                  {p.name} · {formatIDR(p.price)}/{cycleUnit(p.billingCycle)}
                  {p.code === currentPlanCode ? (recovery ? " (sebelumnya)" : " (aktif)") : ""}
                </Button>
              ))}
            </div>
            {planMissing && (
              <p
                role="alert"
                className="mt-2 border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] text-destructive"
              >
                Plan ini tidak tersedia lagi. Pilih plan lain untuk melanjutkan.
              </p>
            )}
          </section>

          {availableAddOns.length > 0 && (
            <section>
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {"02. ADD-ON: ATUR JUMLAH SENDIRI"}
              </p>
              <ul className="flex flex-col gap-2">
                {availableAddOns.map((a) => {
                  const qty = qtyById[a.id] ?? 0;
                  return (
                    <li
                      key={a.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-none border-2 px-3 py-2 ${
                        qty > 0 ? "border-ink" : "border-dashed border-ink/40"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-mono text-xs uppercase tracking-[0.1em]">
                          {a.name}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                          +{formatIDR(a.prices[targetCycle] ?? 0)} /{unit} per unit
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="neutral"
                          size="icon-sm"
                          onClick={() => setQty(a.id, qty - 1)}
                          disabled={qty <= 0}
                          aria-label={`Kurangi ${a.name}`}
                        >
                          <Minus className="size-4" aria-hidden />
                        </Button>
                        <input
                          type="number"
                          min={0}
                          max={a.unit === "feature" ? 1 : 99}
                          value={qty}
                          onChange={(e) => setQty(a.id, Number(e.target.value))}
                          aria-label={`Jumlah ${a.name}`}
                          className="min-h-11 w-16 rounded-none border-2 border-ink bg-surface px-2 text-center text-sm tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        />
                        <Button
                          type="button"
                          variant="neutral"
                          size="icon-sm"
                          onClick={() => setQty(a.id, qty + 1)}
                          disabled={qty >= (a.unit === "feature" ? 1 : 99)}
                          aria-label={`Tambah ${a.name}`}
                        >
                          <Plus className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {availableAddOns.length < addOns.length && (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                  Add-on tanpa harga untuk siklus {unit} tidak ditampilkan.
                </p>
              )}
            </section>
          )}

          <section>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {"03. VOUCHER PROMO: OPSIONAL"}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={promoInput}
                onChange={(e) => {
                  setPromoInput(e.target.value.toUpperCase());
                  setPromo(null);
                  setPromoError(null);
                }}
                placeholder="Kode promo"
                aria-label="Kode promo"
                className="min-h-11 min-w-40 flex-1 rounded-none border-2 border-ink bg-surface px-3 py-1 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
              <Button
                type="button"
                variant="neutral"
                size="sm"
                onClick={() => void applyPromo()}
                disabled={promoBusy || !promoInput.trim()}
              >
                {promoBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <TicketPercent className="size-4" aria-hidden />
                )}
                Pakai
              </Button>
            </div>
            {promoError && (
              <p
                role="alert"
                className="mt-2 border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] text-destructive"
              >
                {promoError}
              </p>
            )}
            {promo && (
              <p className="mt-2 flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-[0.05em]">
                <Check className="size-4" aria-hidden /> {promo.code}: DISKON{" "}
                <span className="tabular-nums">{formatIDR(promo.discount)}</span>
              </p>
            )}
          </section>

          <section className="border-t-2 border-ink/10 pt-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {"04. HARGA FIX"}
            </p>
            <dl className="flex flex-col gap-1 text-sm">
              {isActualPlanChange && plan && (
                <div className="flex justify-between">
                  <dt className="font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground">
                    Plan {plan?.name ?? "-"} /{unit}
                  </dt>
                  <dd className="font-mono font-bold tabular-nums">
                    {formatIDR(plan?.price ?? 0)}
                  </dd>
                </div>
              )}
              {addOnLines.map((l) => (
                <div key={l.addOn.id} className="flex justify-between">
                  <dt className="font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground">
                    {l.addOn.name} ×{l.qty} /{unit}
                  </dt>
                  <dd className="font-mono font-bold tabular-nums">
                    {formatIDR(l.price * l.qty)}
                  </dd>
                </div>
              ))}
              {promo && (
                <div className="flex justify-between text-destructive">
                  <dt className="font-mono text-xs uppercase tracking-[0.05em]">
                    Diskon {promo.code}
                  </dt>
                  <dd className="font-mono font-bold tabular-nums">−{formatIDR(promo.discount)}</dd>
                </div>
              )}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-3">
                <dt className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Total /{unit}
                </dt>
                <dd className="font-display text-4xl uppercase tracking-tight tabular-nums">
                  {totalLabel}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink/10 pt-4">
          <p className="max-w-[40ch] text-xs text-muted-foreground">
            Konfirmasi → invoice terbit → bayar QRIS. QR hanya dibuat setelah Anda menekan tombol
            bayar.
          </p>
          <Button type="button" onClick={() => void confirm()} disabled={busy || !canConfirm}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Konfirmasi & lanjut bayar: {totalLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
