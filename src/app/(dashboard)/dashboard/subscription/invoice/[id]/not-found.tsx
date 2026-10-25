import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";

export const metadata: Metadata = {
  title: "Invoice tidak ditemukan | SnapyOS",
};

/**
 * 404 khusus halaman invoice — menggantikan root not-found (full-screen
 * "Ke Beranda") agar tampil di dalam shell dashboard (brutalist, docs/11/13)
 * dengan pesan yang relevan ke konteks subscription.
 */
export default function InvoiceNotFound() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <div className="flex flex-col items-start gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"ERROR 404: INVOICE"}
        </p>
        <h1 className="font-display text-4xl uppercase tracking-tight">Invoice tidak ditemukan</h1>
        <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
          Invoice tidak ada, bukan milik business Anda, atau sudah dihapus. Kembali ke Subscription
          untuk melihat tagihan aktif.
        </p>
        <Link href="/dashboard/subscription" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft className="size-4" aria-hidden /> Kembali ke Subscription
        </Link>
      </div>
    </div>
  );
}
