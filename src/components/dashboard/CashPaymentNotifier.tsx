"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, X } from "lucide-react";
import { formatIDR } from "@/lib/dashboard-math";
import { confirmCashPaymentAction } from "@/server/cash-payment-actions";

type PendingItem = {
  payment_reference: string;
  amount: number;
  photobox_name: string;
  outlet_name: string | null;
  created_at: string;
};

const POLL_MS = 5000;

/**
 * Notifikasi "bayar di kasir" — poll permintaan tunai pending lalu tampilkan
 * kartu konfirmasi. Dipasang di shell /dashboard (owner/manager) & /staff.
 */
export function CashPaymentNotifier({ businessId }: { businessId: string }) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/business/${businessId}/cash-payments`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: PendingItem[] };
      setItems(json.data ?? []);
    } catch {
      /* network error — retry next poll */
    }
  }, [businessId]);

  useEffect(() => {
    const tick = () => void load();
    tick();
    timerRef.current = setInterval(tick, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  async function confirm(item: PendingItem) {
    setBusyRef(item.payment_reference);
    setError(null);
    try {
      const result = await confirmCashPaymentAction(item.payment_reference);
      if (result.ok) {
        setItems((prev) => prev.filter((p) => p.payment_reference !== item.payment_reference));
      } else {
        setError(result.error ?? "Gagal mengonfirmasi.");
      }
    } catch {
      setError("Gagal mengonfirmasi.");
    } finally {
      setBusyRef(null);
    }
  }

  if (items.length === 0 || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] border-2 border-ink bg-accent shadow-[6px_6px_0_0_#111111]"
    >
      <header className="flex items-center justify-between gap-2 border-b-2 border-ink bg-ink px-3 py-2 text-bg">
        <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
          <Banknote className="size-4" aria-hidden />
          [ BAYAR DI KASIR ] {items.length}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Tutup notifikasi"
          className="flex size-6 items-center justify-center border border-bg/40 text-bg hover:bg-bg hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto p-3">
        {items.map((item) => (
          <li key={item.payment_reference} className="border-2 border-ink bg-bg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-base font-bold uppercase leading-tight">
                  {item.photobox_name}
                </p>
                <p className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {item.outlet_name ?? "—"}
                </p>
              </div>
              <strong className="shrink-0 font-mono text-sm">{formatIDR(item.amount)}</strong>
            </div>
            <button
              type="button"
              disabled={busyRef === item.payment_reference}
              onClick={() => void confirm(item)}
              className="mt-2 w-full border-2 border-ink bg-accent px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.05em] shadow-[2px_2px_0_0_#111111] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
            >
              {busyRef === item.payment_reference ? "Memproses..." : "Konfirmasi bayar"}
            </button>
          </li>
        ))}
      </ol>

      {error && (
        <p className="border-t-2 border-ink bg-destructive px-3 py-2 font-mono text-[10px] font-bold uppercase text-bg">
          {error}
        </p>
      )}
    </div>
  );
}
