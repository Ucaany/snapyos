import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { InvoicePayClient } from "@/components/dashboard/InvoicePayClient";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/tenant";
import { getInvoiceDetail } from "@/server/payment/invoice";

/**
 * Cek keberadaan invoice di fase metadata (SEBELUM body streaming oleh
 * loading.tsx). `notFound()` di sini terjadi sebelum Suspense boundary
 * commit → HTTP 404 asli + title yang benar, bukan 200 dengan title halaman.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  if (user) {
    const invoice = await getInvoiceDetail(user.id, id);
    if (!invoice) notFound();
  }
  return { title: "Bayar Invoice | SnapyOS" };
}

/** /dashboard/subscription/invoice/[id] — halaman pembayaran khusus (QRIS). */
export default async function InvoicePayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const invoice = await getInvoiceDetail(user.id, id);
  if (!invoice) notFound();

  const itemName = invoice.items
    .map((it) => (it.qty > 1 ? `${it.name} ×${it.qty}` : it.name))
    .join(" + ");

  return (
    <PageShell>
      <PageHeader
        eyebrow="PEMBAYARAN INVOICE: QRIS"
        title="Bayar Invoice"
        description={`Invoice ${invoice.number} · ${invoice.businessName} · batas waktu berlaku untuk QR aktif. QR kedaluwarsa dapat diganti tanpa mengubah invoice, plan, atau add-on.`}
        right={
          <Button
            variant="neutral"
            size="sm"
            nativeButton={false}
            render={<Link href="/dashboard/subscription" />}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Subscription
          </Button>
        }
      />

      <InvoicePayClient
        invoiceId={invoice.id}
        invoiceNumber={invoice.number}
        amount={invoice.amount}
        businessName={invoice.businessName}
        itemName={itemName}
        items={invoice.items}
        canWrite={invoice.canWrite}
        initialStatus={invoice.status}
      />
    </PageShell>
  );
}
