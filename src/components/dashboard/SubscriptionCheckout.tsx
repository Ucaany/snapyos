"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Minus, Plus, TicketPercent } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatIDR } from "@/lib/dashboard-math";
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
  // Recovery (expired): plan lama dianggap "plan change" — server selalu
  // menerbitkan plan_change item (periode baru), preview harga harus match.
  const isActualPlanChange = recovery || planCode !== currentPlanCode;

  const addOnLines = useMemo(
    () =>
      addOns
        .map((a) => ({ addOn: a, qty: qtyById[a.id] ?? 0 }))
        .filter((l) => l.qty > 0),
    [addOns, qtyById]
  );
  // Match server logic: plan price only charged on actual plan change.
  const gross = (isActualPlanChange ? (plan?.priceMonthly ?? 0) : 0) + addOnLines.reduce((s, l) => s + l.addOn.priceMonthly * l.qty, 0);
  const total = Math.max(0, gross - (promo?.discount ?? 0));

  function setQty(id: string, qty: number) {
    setQtyById((prev) => {
      const next = { ...prev };
      const q = Math.max(0, Math.min(99, Math.floor(qty) || 0));
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
        planCode,
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
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>
          Konfirmasi checkout — harga fix setelah Anda konfirmasi
        </DialogTitle>
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
              {"/// 01. PLAN"}
            </p>
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant={p.code === planCode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setPlanCode(p.code);
                    setPromo(null);
                    setPromoError(null);
                  }}
                  aria-pressed={p.code === planCode}
                >
                  {p.name} · {formatIDR(p.priceMonthly)}
                  {p.code === currentPlanCode ? (recovery ? " (sebelumnya)" : " (aktif)") : ""}
                </Button>
              ))}
            </div>
          </section>

          {addOns.length > 0 && (
            <section>
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {"/// 02. ADD-ON — ATUR JUMLAH SENDIRI"}
              </p>
              <ul className="flex flex-col gap-2">
                {addOns.map((a) => {
                  const qty = qtyById[a.id] ?? 0;
                  return (
                    <li
                      key={a.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-none border-2 px-3 py-2 ${
                        qty > 0 ? "border-ink" : "border-dashed border-ink/40"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-mono text-xs uppercase tracking-[0.1em]">{a.name}</span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                          +{formatIDR(a.priceMonthly)} /bulan per unit
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
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
                          max={99}
                          value={qty}
                          onChange={(e) => setQty(a.id, Number(e.target.value))}
                          aria-label={`Jumlah ${a.name}`}
                          className="h-9 w-16 rounded-none border-2 border-ink bg-surface px-2 text-center text-sm tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => setQty(a.id, qty + 1)}
                          disabled={qty >= 99}
                          aria-label={`Tambah ${a.name}`}
                        >
                          <Plus className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {"/// 03. VOUCHER PROMO — OPSIONAL"}
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
                className="h-9 min-w-40 flex-1 rounded-none border-2 border-ink bg-surface px-3 py-1 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void applyPromo()}
                disabled={promoBusy || !promoInput.trim()}
              >
                {promoBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <TicketPercent className="size-4" aria-hidden />}
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
                <Check className="size-4" aria-hidden /> {promo.code} — DISKON{" "}
                <span className="tabular-nums">{formatIDR(promo.discount)}</span>
              </p>
            )}
          </section>

          <section className="border-t-2 border-ink/10 pt-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {"/// 04. HARGA FIX"}
            </p>
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground">
                  Plan {plan?.name ?? "—"}
                </dt>
                <dd className="font-mono font-bold tabular-nums">{formatIDR(plan?.priceMonthly ?? 0)}</dd>
              </div>
              {addOnLines.map((l) => (
                <div key={l.addOn.id} className="flex justify-between">
                  <dt className="font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground">
                    {l.addOn.name} ×{l.qty}
                  </dt>
                  <dd className="font-mono font-bold tabular-nums">
                    {formatIDR(l.addOn.priceMonthly * l.qty)}
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
                  Total
                </dt>
                <dd className="font-display text-4xl uppercase tracking-tight tabular-nums">
                  {formatIDR(total)}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink/10 pt-4">
          <p className="max-w-[40ch] text-xs text-muted-foreground">
            Konfirmasi → invoice terbit → bayar QRIS. QR hanya dibuat setelah Anda
            menekan tombol bayar.
          </p>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || !plan}
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Konfirmasi & lanjut bayar — {formatIDR(total)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
