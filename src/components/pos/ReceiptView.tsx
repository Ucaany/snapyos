"use client";

import { useRouter } from "next/navigation";
import { Printer, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/dashboard-math";
import type { PosOrderDetail } from "@/server/pos-orders";

const METHOD_LABEL: Record<string, string> = {
  cash: "TUNAI",
  bank_transfer: "TRANSFER BANK",
  other: "LAINNYA",
};

/**
 * ReceiptView — struk siap-cetak (A12: window.print, tanpa printer SDK).
 * Tombol disembunyikan saat print (print:hidden).
 */
export function ReceiptView({ detail, businessName }: { detail: PosOrderDetail; businessName: string }) {
  const router = useRouter();
  const { order, items } = detail;

  return (
    <div className="print-root mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 p-4 md:p-8 print:mx-0 print:min-h-0 print:w-full print:max-w-none print:p-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button variant="outline" size="sm" onClick={() => router.push("/pos")}>
          <RotateCcw aria-hidden />
          Transaksi baru
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer aria-hidden />
          Cetak struk
        </Button>
      </div>

      <article className="flex flex-col gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111] print:border-0 print:shadow-none">
        <header className="flex flex-col gap-1 border-b-2 border-ink pb-4 text-center">
          <p className="font-display text-xl uppercase tracking-tight">{businessName}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            STRUK PENJUALAN POS
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em]">
          <div>
            <dt className="text-muted-foreground">No. order</dt>
            <dd className="font-bold">{order.number}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Metode</dt>
            <dd className="font-bold">{METHOD_LABEL[order.payment_method] ?? order.payment_method}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Booth</dt>
            <dd className="font-bold">{order.photobox_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Outlet</dt>
            <dd className="font-bold">{order.outlet_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kasir</dt>
            <dd className="font-bold">{order.cashier_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Waktu</dt>
            <dd className="font-bold">
              {new Date(order.paid_at ?? order.created_at).toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
                dateStyle: "short",
                timeStyle: "short",
              })}
            </dd>
          </div>
        </dl>

        <table className="border-collapse border-t-2 border-ink font-mono text-xs">
          <caption className="sr-only">Item pembelian</caption>
          <thead>
            <tr className="border-b-2 border-ink text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th scope="col" className="py-2">Item</th>
              <th scope="col" className="py-2 text-right">Qty</th>
              <th scope="col" className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-ink/10">
                <td className="py-2 pr-2 font-bold uppercase leading-snug">{item.name_snapshot}</td>
                <td className="py-2 text-right">×{item.quantity}</td>
                <td className="py-2 text-right font-bold">{formatIDR(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="flex flex-col gap-1 border-t-2 border-ink pt-3 font-mono text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Subtotal</dt>
            <dd>{formatIDR(order.gross_amount)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Diskon</dt>
            <dd>{formatIDR(order.discount_amount)}</dd>
          </div>
          <div className="flex items-center justify-between border-t-2 border-ink pt-2">
            <dt className="text-[10px] font-bold uppercase tracking-[0.15em]">Total</dt>
            <dd className="text-lg font-bold">{formatIDR(order.final_amount)}</dd>
          </div>
        </dl>

        <footer className="border-t-2 border-dashed border-ink/30 pt-3 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
             Terima kasih. SnapyOS POS
          </p>
        </footer>
      </article>
    </div>
  );
}
