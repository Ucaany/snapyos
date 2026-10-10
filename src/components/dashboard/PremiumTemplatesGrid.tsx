"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Lock, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIDR } from "@/lib/dashboard-math";
import { purchaseTemplateAction } from "@/server/template-purchase-actions";
import type { PremiumTemplateRow } from "@/server/template-purchase";

type Props = {
  templates: PremiumTemplateRow[];
};

/** Marketplace template premium — beli via QRIS invoice (docs/15 §15.9b). */
export function PremiumTemplatesGrid({ templates }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  function buy(templateId: string) {
    setError(null);
    setBuyingId(templateId);
    startTransition(async () => {
      try {
        const res = await purchaseTemplateAction(templateId);
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.invoiceId) {
          router.push(`/dashboard/subscription/invoice/${res.invoiceId}`);
        }
      } catch {
        setError("Gagal memulai pembelian. Coba lagi.");
      } finally {
        setBuyingId(null);
      }
    });
  }

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        eyebrow="TIDAK ADA TEMPLATE PREMIUM"
        title="Belum ada template premium yang dijual."
        body="Admin platform akan menambahkan frame premium berbayar di sini."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] text-destructive">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Template premium">
        {templates.map((tpl) => (
          <li
            key={tpl.id}
            className="flex flex-col border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]"
          >
            <div className="flex h-44 items-center justify-center overflow-hidden border-b-2 border-ink bg-[repeating-linear-gradient(45deg,#FFFDF5_0_10px,#F4F4F0_10px_20px)]">
              {tpl.thumbnail_url || tpl.file_url ? (
                <Image
                  src={tpl.thumbnail_url ?? tpl.file_url}
                  alt={`Preview template premium ${tpl.name}`}
                  width={480}
                  height={320}
                  className="max-h-full max-w-full object-contain p-3"
                  loading="lazy"
                  unoptimized
                />
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  PREVIEW TIDAK TERSEDIA
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold uppercase tracking-[0.05em]">{tpl.name}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    {tpl.category_name ?? "Tanpa kategori"} · PREMIUM
                  </p>
                </div>
                <span className="inline-block border-2 border-ink bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg">
                  PREMIUM
                </span>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 border-t-2 border-ink/10 pt-3">
                <span className="font-mono text-sm font-bold tabular-nums">{formatIDR(tpl.price)}</span>
                {tpl.purchased ? (
                  <span className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase text-muted-foreground">
                    <Check className="size-4" aria-hidden /> Dimiliki
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => buy(tpl.id)}
                    disabled={pending && buyingId === tpl.id}
                  >
                    <ShoppingCart aria-hidden />
                    {pending && buyingId === tpl.id ? "Memproses…" : "Beli"}
                  </Button>
                )}
              </div>
              {!tpl.is_active ? (
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <Lock className="size-3" aria-hidden /> Sedang nonaktif
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
